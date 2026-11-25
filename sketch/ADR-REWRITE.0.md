# Rewriting the decision record

The rewrite of `ADR.md`: the 81 old entries (about 58,800 words, 74 of
them over 200 words) become 12, numbered ADR-101 to ADR-112, each at
most 200 words, holding only decisions that change what the project is.
The maintainer's rulings on the draft are in section 6. Numbers start
at 101 so that every stale citation of an old number fails the comment
gate's `stale-adr` check rather than silently naming another decision.

## 1. Classes

- **F** — a fundamental architecture or product decision that still
  holds. Kept, rewritten, merged where several entries are one decision.
- **L** — a rule of the language or of a tool's observable behaviour.
  Removed; it belongs in the Lean definition under `spec/`, or, where
  the definition's stated scope excludes it (text, canon, finding
  sites, budgets, the importer and exporter, the CLI), in `docs/`.
- **P** — a rule of how work is done. Removed; it belongs in
  `DEV-PROCESS.md` or `AGENTS.md`.
- **R** — retired, relocated, superseded or obsolete. Removed.

| Class | Entries |
|---|---|
| F | 25, merged into 12 new entries (two drafted entries, from 024 and 039, dropped as detail) |
| L | 44: the definition covers 18, partly covers 13, and 13 lie outside its scope |
| P | 6, all already stated in DEV-PROCESS.md, AGENTS.md or spec/README.md |
| R | 6 |

## 2. Classification

"Covers" for an L entry: **Yes** — the definition states the rule;
**Partly** — some of it, the rest named in the reason; **No (outside
scope)** — the definition excludes the subject by design, so the Lean
session will not pick it up and the rule's home is the `docs/` page
named.

| Old | Title | Class | New (F) / definition covers (L) | Reason | Citation becomes |
|---|---|---|---|---|---|
| 001 | TypeScript and Go stay at full parity, driven by a shared spec | F | ADR-102 | Parity and the shared rows are what the project is; merged with 017 | ADR-102 |
| 002 | Test coverage stays at 100 % in both implementations | F | ADR-103 | A standing quality commitment over both ports | ADR-103 |
| 003 | Host-provided semantics are normalised, not trusted | F | ADR-105 | Principle kept; the `re()` dialect detail is in docs/reference-language.md, not the definition (`Host` is opaque) | ADR-105 |
| 004 | A preference override must be admitted by its disjunction | L | Yes | `spec/Aontu/Meet.lean` `admits_pref_iff`, `admits_or_iff`; `Verdict.lean` `selectArm_*` | `spec/Aontu/Meet.lean` |
| 005 | Template instantiation is per-destination | L | Partly | `Judge` reads a spread on each member alone (`spec/Aontu/Admits.lean`); the per-destination clone is engine mechanism, not a rule | `spec/Aontu/Admits.lean`, or delete |
| 006 | Template application is stateless, and a generator snapshots a settled source | L | Partly | The definition is stateless by construction; a generator reading a settled source waits on P9 (generation with `emit`) | delete |
| 007 | An unresolved disjunction is not a value, and vet asks the same question the evaluator does | L | Yes | `spec/Aontu/Output.lean` `output_admits`, `gen_admits`; `Verdict.lean` `vet_strict_valid_instance` | `spec/Aontu/Output.lean` |
| 008 | Constraints are named, not spelled with operators | L | Yes | The syntax (`spec/Aontu/Syntax.lean`) has only named atoms; no operator spellings exist to state | delete |
| 009 | There are no reserved path elements: `$KEY`, `$SELF` and `$PARENT` are removed | L | Yes | `key`/`keyUp` in `spec/Aontu/Syntax.lean`; no path segment is reserved | `spec/Aontu/Syntax.lean`, or delete |
| 010 | No magic keys or paths: the tree at all levels is user space | F | ADR-106 | Binds the engine and every verb, not only the language | ADR-106 |
| 011 | The star is sugar; the disjunction is the structure | L | Yes | `Val.pref` in `spec/Aontu/Syntax.lean`; `admits_pref_iff` in `Meet.lean`; `pref_le_or` in `Subsume.lean` | `spec/Aontu/Meet.lean` |
| 012 | An include's extension decides what the file is: Aontu source, config data, or refused | L | No (outside scope) | How a file becomes a value is the reader's, outside the definition; the table is in docs/reference-language.md | docs/reference-language.md, or delete |
| 013 | The project operates one transparency log, and nothing else | R | — | Superseded by 019; its surviving constraints are restated in new ADR-110 | ADR-110 |
| 014 | The tree is the namespace: there is no identity mark | L | Partly | `link` (`relate`) is in `Syntax.lean`; `refer()` addresses and relations wait on P11 | delete, or `spec/Aontu/Syntax.lean` |
| 015 | Paths are first-class values: `path(p)` captures, and a vacuous constructor call is a kind | L | Yes | `addr` and the `path` kind in `Syntax.lean`; the prefix rule in `Admits.lean` | `spec/Aontu/Admits.lean` |
| 016 | A string is never a path: conversion lives in the call, and paths meet by prefix | L | Partly | Prefix rule held; `refer()`/`rel()` refusing a string address waits on P11 | `spec/Aontu/Admits.lean` |
| 017 | The builtin call surface is declared, parsed by both ports | F | ADR-102 | The single declaration staged into both ports is ADR-102's "authored once" clause | ADR-102 |
| 018 | The pipe operator is removed | R | — | Relocated to an issue | delete |
| 019 | The project stores module bytes, and federates the log | F | ADR-110 | Merged with 021 (and 013's surviving constraints) | ADR-110 |
| 020 | A module path is `<domain>/<path>`, and the domain is a proved namespace | F | ADR-111 | Merged with 022 | ADR-111 |
| 021 | The project hosts private packages, with authenticated reads | F | ADR-110 | Private tier folded into the repository entry | ADR-110 |
| 022 | Compatibility is computed, so the major leaves the name | F | ADR-111 | Merged with 020 | ADR-111 |
| 023 | G9 completes at the renderer: the reflection sidecar, the Jostraca bridge and string interpolation are retired | R | — | Retired: its enforcement clause was reached | delete |
| 024 | The forge's token authorises a publish, and Sigstore is one provider of the proof, not its definition | F | dropped (docs/reference-packages.md) | Publish authorisation and the proof contract | dropped (docs/reference-packages.md) |
| 025 | A reference's copy is an instance, and a match does not fire on an unfilled hole | L | Partly | `hole` and `select` exist; a `match` waiting on an unfilled hole is not stated; the copy's ownership is engine mechanism | delete |
| 026 | `each` is retired: `form` carries the bound | R | — | Relocated to an issue | delete |
| 027 | The list generator is named `each`, and `_ & t` is its bound | R | — | Relocated to an issue | delete |
| 028 | Every language-supplied schema is named under `aontu:` | F | ADR-107 | Merged with 029 and 036 | ADR-107 |
| 029 | A bundled model lands under `$.aontu`, not at the document root | F | ADR-107 | Merged with 028 and 036 | ADR-107 |
| 030 | The path of a meet is the slot it was driven at | L | No (outside scope) | Which site a finding names is outside the definition (DEFINITION.0.md §1); pinned by shared rows | delete |
| 031 | A path part that names a type is CamelCase | R | — | Relocated to an issue | delete |
| 032 | Code comments are sparse and terse: intent lives in names, requirements live in documents | P | — | Stated in DEV-PROCESS.md, "Code comments" | DEV-PROCESS.md#code-comments |
| 033 | A grammar is a string, and parsing is a function | L | Yes | `grammar` (`parse(g)`) in `Syntax.lean`; `abnf`/`parse` in `Fn` (`Arith.lean`); compile and tree via `Host` | `spec/Aontu/Arith.lean` |
| 034 | Absence is a value, and `maybe` is where it is made | L | Yes | `absent` in `Syntax.lean`; absence through calls in `Verdict.lean`; `admits_nil_iff`, `nil_le` | `spec/Aontu/Syntax.lean` |
| 035 | A language is configured in its profile, and a marker may name its closer | L | No (outside scope) | Template/fmt profile and `--marker` are tool behaviour; documented in docs/reference-api.md | docs/reference-api.md, or delete |
| 036 | A bundled model is a file in `aontu/`, not a string in each port | F | ADR-107 | Bundled models as files; the staging clause is ADR-102's | ADR-107 |
| 037 | Two lists concatenate under `+`, and a sum of an absence is absent | L | Partly | `plusOf_lists` in `Verdict.lean`; absence absorbing a sum to be confirmed now that `absent` exists | `spec/Aontu/Verdict.lean` |
| 038 | The component tree is the only output road, and aontu knows no languages | F | ADR-108 | Merged with 040 and 079 | ADR-108 |
| 039 | The package system has one vocabulary, one set of files, and three pins | F | dropped (docs/reference-packages.md) | Vocabulary, files and the three pins; verb tiers, cache layout and cooldown are detail for docs/reference-packages.md | dropped (docs/reference-packages.md) |
| 040 | `aontu render` writes the component tree through jostraca, in both ports | F | ADR-108 | `render` through jostraca | ADR-108 |
| 041 | The npm package and the Go module share one version series | F | ADR-104 | One version series | ADR-104 |
| 042 | `.aontu` is the only extension an aontu source file carries | L | No (outside scope) | File naming is outside the definition; belongs in docs/reference-language.md | delete |
| 043 | A container template waits for a member that has not decided | L | Partly | An absent member is left out of output (`Verdict.lean`, `isAbsent`); a template waiting for an undecided member is not stated | delete |
| 044 | The site renders the documentation; it does not author it | F | ADR-112 | Where documentation is authored | ADR-112 |
| 045 | Required wins in the meet | L | Yes | `merge_exact` (`Order.lean`), `meetKey_declared`, `optional_iff` (`Meet.lean`) | `spec/Aontu/Meet.lean` |
| 046 | A written `nil` under an optional key forbids the key | L | Yes | `admits_map_iff` with `admits_nil_iff` (`Meet.lean`) | `spec/Aontu/Meet.lean` |
| 047 | The JSON Schema importer owns the meaning | F | ADR-109 | Merged with 068; importer detail lives in docs/how-to/import-json-schema.md | ADR-109 |
| 048 | Divisibility reads the number a value shows | L | Yes | `mulof` rules of `Judge` (`Admits.lean`), `Number.multipleOf` (`Data.lean`) | `spec/Aontu/Admits.lean` |
| 049 | Logic counts the trial schemas that admit a value | L | Yes | `judge_nof_zero` (`Trial.lean`) | `spec/Aontu/Trial.lean` |
| 050 | A conditional holds a value to the branch its condition picks | L | Yes | `judge_when_iff`, `when_nil_refuses` (`Trial.lean`) | `spec/Aontu/Trial.lean` |
| 051 | A container counts the members a trial schema admits | L | Yes | `judge_contains_empty`, `contains_refuses_scalar` (`Trial.lean`) | `spec/Aontu/Trial.lean` |
| 052 | Annotations ride a value and meet as a union | L | Partly | Riders (`ride`, `Record`) in `Syntax.lean`; the key-wise union meet of two records is not yet stated (spec/README.md) | `spec/Aontu/Syntax.lean` |
| 053 | A closed map drops an optional key it does not declare | L | Yes | `meetKey_sealed` (`Meet.lean`) | `spec/Aontu/Meet.lean` |
| 054 | The admission trial is asked once, counted, and stopped when its count is decided | L | No (outside scope) | Trial caching and the `trials` budget are evaluation strategy and budgets, outside the definition; documented in docs/trust.md | docs/trust.md, or delete |
| 055 | `must` asks the admission trial | L | Yes | `judge_must_iff_nof` (`Trial.lean`) | `spec/Aontu/Trial.lean` |
| 056 | Identity rides the alias declaration | L | Yes | `ident` rider; `ident_place` (`Verdict.lean`); a copy drops it (`Val.unident`, `Names.lean`) | `spec/Aontu/Names.lean` |
| 057 | A dynamic reference is specialised at import | L | No (outside scope) | Importer behaviour (`$dynamicRef`); a tool, held to the JSON Schema suite | docs/how-to/import-json-schema.md, or delete |
| 058 | Unevaluated members are checked by `rest()` | L | Yes | `rest_admits_scalar`, `rest_nil_closes` (`Trial.lean`) | `spec/Aontu/Trial.lean` |
| 059 | A format is a grammar aontu reads and runs itself | F | ADR-105 | Principle kept; the committed grammars and their RFC departures belong in docs/reference-functions.md | ADR-105 |
| 060 | aontu matches a pattern with its own engine | F | ADR-105 | Principle kept; dialect and refusals belong in docs/reference-language.md | ADR-105 |
| 061 | An earlier dialect is upgraded before it is read | L | No (outside scope) | Importer dialect upgrade; tool behaviour | docs/how-to/import-json-schema.md, or delete |
| 062 | A recursive residual meets a kind, a disjunction and another residual | L | Partly | `expand` leaves a recursive name as a residual (`Alias.lean`); its meets with a kind or disjunction are partly held; the printed name is canon, outside | `spec/Aontu/Alias.lean` |
| 063 | The vocabularies a meta-schema lists decide what its schemas read | L | No (outside scope) | Importer `$vocabulary` handling; tool behaviour | docs/how-to/import-json-schema.md, or delete |
| 064 | The published meta-schemas ship with the importer | L | No (outside scope) | Vendored meta-schemas; tool behaviour | delete |
| 065 | An input that imports is checked against its meta-schema | L | No (outside scope) | Meta-schema check of an import; tool behaviour | docs/how-to/import-json-schema.md, or delete |
| 066 | A vet report answers JSON Schema's output units through the importer's source map | L | No (outside scope) | `vet` report pointers and the importer source map; tool behaviour | docs/reference-api.md, or delete |
| 067 | Subsumption reads a recursion as the definition it names | L | Partly | `LeD`, `alias_le_unroll` (`Profiles.lean`); two recursions of one shape under different names left undecided | `spec/Aontu/Profiles.lean` |
| 068 | An import comes back from its own export | F | ADR-109 | The round-trip gate; its canon/subsumption clauses are language (canon outside scope) | ADR-109 |
| 069 | The language is defined in Lean, and the ports implement it | F | ADR-101 | The definition is normative | ADR-101 |
| 070 | The standard CI run samples, the daily run decides, and releases come from `release` | P | — | Stated in AGENTS.md ("Before you push", "Releasing"); the groups manifest detail is in ts/test/groups.tsv | AGENTS.md |
| 071 | A push is checked in two minutes and a pull request in five | P | — | Stated in AGENTS.md and DEV-PROCESS.md "Testing" | DEV-PROCESS.md#testing |
| 072 | A `meta()` record is open metadata | L | Partly | An open record of data is the `Record` of `Syntax.lean`; the exporter's conventions are tool behaviour | `spec/Aontu/Syntax.lean` |
| 073 | An `ident()` record is open declaration metadata | L | Partly | As 072, for `ident()` | `spec/Aontu/Syntax.lean` |
| 074 | What a rider's record holds is no export loss | L | No (outside scope) | Exporter loss reporting; tool behaviour | delete |
| 075 | Local testing takes minutes, and the long runs are the daily CI's | P | — | Stated in DEV-PROCESS.md "Testing" | DEV-PROCESS.md#testing |
| 076 | Every prompt is logged | P | — | Stated in DEV-PROCESS.md "The prompt log" | DEV-PROCESS.md#the-prompt-log |
| 077 | The definition is pinned to Lean 4.24.1 | P | — | A toolchain pin; stated in spec/lean-toolchain and spec/README.md "Build and run" | spec/README.md |
| 078 | Every figure draws SVG, from a layout aontu owns | F | ADR-105 | No renderer subprocess; the layouts are detail for docs | ADR-105 |
| 079 | The npm package takes jostraca as a peer, at a range | F | ADR-108 | The jostraca peer range is ADR-108's cost clause | ADR-108 |
| 080 | Canon writes a builtin under its own name | L | No (outside scope) | Canon is text; the definition says nothing about text. Documented in docs/reference-language.md | docs/how-to/see-canonical-form.md, or delete |
| 081 | A document reads alike in whatever order it is written | L | Partly | `Val.Reordered.judge` (`Reorder.lean`) proves it of admission; `vetP` is checked on rows, not proved | `spec/Aontu/Reorder.lean` |

## 3. L entries the definition does not yet cover

Removing these loses the rule's statement in a normative place unless
someone picks it up.

**For the Lean session** (in the definition's scope, not yet stated):

- 006 — a generator reads a settled source (P9, generation).
- 014, 016 — `refer()` addresses, relations, and the refusal of a
  string where an address is wanted (P11, links).
- 025 — a `match` on an unfilled hole waits rather than firing.
- 037 — a sum with an absent operand is absent (confirm against
  `plusOf` now that `absent` exists).
- 043 — a container template waits for a member that has not decided.
- 052 — two rider records meet as their key-wise union.
- 062 — a recursive residual's meet with a kind, a disjunction or
  another residual.
- 067 — two recursions of one shape under different names.
- 081 — order independence of `vetP` is checked on rows, not proved.

**Outside the definition by design** (home is `docs/`, most already
documented there, so removal loses only the rationale): 012, 030, 035,
042, 054, 057, 061, 063, 064, 065, 066, 074, 080, and the tool halves of
072 and 073. The F merges also drop detail that is not fundamental and
needs a docs home before removal: the `re()` dialect and refusals
(003, 060), the committed format grammars and their RFC departures
(059), the importer's keyword-by-keyword rules (047, 068), the figure
layouts (078), and the package verb tiers, cache layout and cooldown
(039).

## 4. The new record

| New | Decision | From | Words |
|---|---|---|---|
| ADR-101 | The language is defined in Lean, and the ports implement it | 069 | 190 |
| ADR-102 | Two implementations, held at parity by shared rows | 001, 017 | 188 |
| ADR-103 | Coverage stays at 100 % in both implementations | 002 | 138 |
| ADR-104 | One version names a release of both ports | 041 | 109 |
| ADR-105 | aontu owns the meaning of what it reads | 003, 059, 060, 078 | 182 |
| ADR-106 | The tree is user space | 010 | 161 |
| ADR-107 | Language-supplied models are `aontu:` modules | 028, 029, 036 | 160 |
| ADR-108 | Generated output is a component tree, and aontu knows no target language | 038, 040, 079 | 190 |
| ADR-109 | JSON Schema crosses by rewrite, and comes back from its own export | 047, 068 | 196 |
| ADR-110 | The project operates a module repository, and no build needs it | 013, 019, 021 | 198 |
| ADR-111 | A package name is a proved namespace, and compatibility is computed | 020, 022 | 198 |
| ADR-112 | The site renders the documentation; it does not author it | 044 | 130 |

Words are counted from the entry's heading to the next, heading
included (`awk '{n+=NF}'`). The longest is 198.

The two drafted entries from 024 (a forge token authorises a publish,
under a proof contract the project owns) and 039 (a lock pins a
package's bytes and its meaning) were ruled detail: their substance is
stated in `docs/reference-packages.md`, and a citation of either old
number is removed.

## 5. Citation migration

`ADR-NNN` citations across the four repositories, excluding
`node_modules`, `dist` and `dist-test`: 2,254 in all, of which 421 are
`ADR.md` citing itself and leave with it. The other 1,833:

- by repository: aontu 1,651, system 174, mod 4, web 4;
- in aontu by area: `sketch/` 718, `test/` 245, `use-cases/` 190,
  `ts/` 154, `go/` 133, `CHANGELOG.md` 109, `spec/` 38, `docs/` and the
  top-level pages 38, the rest (`Makefile`, `.github/`, `admin/`) 25.

The comment gate scans `.ts`, `.go` and `.rs` source and `aontu/`: 277
citations (144 under `ts/`, 133 under `go/`). Its `stale-adr` rule only
asks that the number exist in `ADR.md`.

Per old number (columns: code = `ts/`, `go/`, `admin/`, `Makefile`,
`.github/`; docs = `docs/` and the top-level pages; other = the
system, mod and web repositories):

| Old | Total | code | test | spec | use-cases | docs | CHANGELOG | sketch | other repos |
|---|---|---|---|---|---|---|---|---|---|
| 001 | 120 | 1 | 3 | 0 | 24 | 12 | 3 | 71 | 6 |
| 002 | 69 | 14 | 0 | 0 | 3 | 6 | 5 | 38 | 3 |
| 003 | 48 | 4 | 3 | 0 | 0 | 2 | 3 | 36 | 0 |
| 004 | 67 | 2 | 12 | 0 | 27 | 1 | 5 | 18 | 2 |
| 005 | 66 | 6 | 9 | 0 | 42 | 0 | 4 | 5 | 0 |
| 006 | 12 | 0 | 0 | 0 | 8 | 0 | 1 | 3 | 0 |
| 007 | 78 | 3 | 18 | 3 | 18 | 1 | 6 | 29 | 0 |
| 008 | 36 | 0 | 0 | 0 | 2 | 0 | 0 | 34 | 0 |
| 009 | 12 | 1 | 3 | 0 | 5 | 0 | 0 | 3 | 0 |
| 010 | 22 | 0 | 3 | 0 | 5 | 0 | 1 | 13 | 0 |
| 011 | 48 | 6 | 10 | 0 | 11 | 4 | 5 | 9 | 3 |
| 012 | 50 | 7 | 3 | 0 | 4 | 2 | 2 | 24 | 8 |
| 013 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 14 | 6 |
| 014 | 64 | 3 | 10 | 0 | 15 | 0 | 2 | 34 | 0 |
| 015 | 10 | 0 | 2 | 0 | 0 | 0 | 3 | 5 | 0 |
| 016 | 25 | 5 | 5 | 0 | 2 | 0 | 1 | 12 | 0 |
| 017 | 6 | 0 | 0 | 0 | 0 | 1 | 1 | 4 | 0 |
| 018 | 14 | 1 | 2 | 0 | 0 | 0 | 1 | 10 | 0 |
| 019 | 66 | 2 | 0 | 0 | 1 | 0 | 1 | 24 | 38 |
| 020 | 29 | 0 | 3 | 0 | 0 | 0 | 0 | 12 | 14 |
| 021 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 8 |
| 022 | 81 | 18 | 3 | 0 | 0 | 0 | 1 | 34 | 25 |
| 023 | 26 | 0 | 0 | 0 | 1 | 0 | 0 | 25 | 0 |
| 024 | 62 | 2 | 0 | 0 | 0 | 0 | 0 | 22 | 38 |
| 025 | 11 | 0 | 2 | 0 | 4 | 0 | 1 | 4 | 0 |
| 026 | 10 | 0 | 3 | 0 | 0 | 0 | 0 | 7 | 0 |
| 027 | 11 | 2 | 2 | 0 | 0 | 0 | 0 | 7 | 0 |
| 028 | 6 | 0 | 2 | 0 | 0 | 0 | 1 | 3 | 0 |
| 029 | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 0 |
| 030 | 3 | 0 | 1 | 0 | 1 | 0 | 1 | 0 | 0 |
| 031 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 032 | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 0 |
| 033 | 22 | 4 | 1 | 0 | 0 | 0 | 1 | 16 | 0 |
| 034 | 20 | 11 | 0 | 0 | 4 | 0 | 2 | 3 | 0 |
| 035 | 7 | 0 | 1 | 0 | 0 | 0 | 1 | 5 | 0 |
| 036 | 11 | 1 | 3 | 0 | 0 | 1 | 1 | 5 | 0 |
| 037 | 17 | 3 | 1 | 1 | 5 | 0 | 4 | 3 | 0 |
| 038 | 40 | 3 | 1 | 0 | 4 | 0 | 1 | 31 | 0 |
| 039 | 77 | 14 | 3 | 0 | 0 | 1 | 3 | 28 | 28 |
| 040 | 12 | 1 | 0 | 0 | 0 | 0 | 0 | 11 | 0 |
| 041 | 11 | 4 | 0 | 0 | 0 | 2 | 1 | 1 | 3 |
| 042 | 6 | 5 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| 043 | 7 | 2 | 1 | 0 | 2 | 0 | 1 | 1 | 0 |
| 044 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| 045 | 15 | 5 | 3 | 2 | 0 | 0 | 2 | 3 | 0 |
| 046 | 11 | 6 | 2 | 0 | 0 | 0 | 1 | 2 | 0 |
| 047 | 5 | 0 | 2 | 0 | 0 | 0 | 1 | 2 | 0 |
| 048 | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 0 |
| 049 | 11 | 0 | 1 | 2 | 0 | 0 | 2 | 6 | 0 |
| 050 | 7 | 0 | 1 | 2 | 0 | 0 | 1 | 3 | 0 |
| 051 | 7 | 0 | 1 | 2 | 0 | 0 | 1 | 3 | 0 |
| 052 | 20 | 11 | 3 | 0 | 1 | 0 | 2 | 3 | 0 |
| 053 | 7 | 0 | 2 | 0 | 0 | 0 | 1 | 4 | 0 |
| 054 | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 0 |
| 055 | 10 | 0 | 2 | 2 | 0 | 0 | 2 | 4 | 0 |
| 056 | 16 | 10 | 4 | 0 | 0 | 0 | 1 | 1 | 0 |
| 057 | 23 | 18 | 3 | 0 | 0 | 0 | 1 | 1 | 0 |
| 058 | 53 | 7 | 39 | 2 | 0 | 0 | 2 | 3 | 0 |
| 059 | 52 | 20 | 27 | 0 | 0 | 0 | 1 | 4 | 0 |
| 060 | 25 | 12 | 8 | 0 | 0 | 0 | 1 | 4 | 0 |
| 061 | 27 | 22 | 2 | 0 | 0 | 0 | 1 | 2 | 0 |
| 062 | 4 | 0 | 0 | 0 | 1 | 0 | 1 | 2 | 0 |
| 063 | 10 | 7 | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 064 | 7 | 4 | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 065 | 11 | 8 | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 066 | 26 | 23 | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 067 | 4 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 0 |
| 068 | 26 | 6 | 15 | 0 | 0 | 1 | 0 | 4 | 0 |
| 069 | 5 | 0 | 0 | 1 | 0 | 0 | 1 | 3 | 0 |
| 070 | 8 | 4 | 0 | 0 | 0 | 2 | 1 | 1 | 0 |
| 071 | 9 | 5 | 0 | 0 | 0 | 2 | 1 | 1 | 0 |
| 072 | 12 | 6 | 2 | 0 | 0 | 0 | 1 | 3 | 0 |
| 073 | 12 | 6 | 2 | 0 | 0 | 0 | 1 | 3 | 0 |
| 074 | 16 | 4 | 4 | 0 | 0 | 0 | 1 | 7 | 0 |
| 075 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 076 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 077 | 3 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 |
| 078 | 5 | 0 | 1 | 0 | 0 | 0 | 1 | 3 | 0 |
| 079 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| 080 | 23 | 4 | 5 | 0 | 0 | 0 | 3 | 11 | 0 |
| 081 | 30 | 0 | 2 | 20 | 0 | 0 | 2 | 6 | 0 |
| all | 1833 | 313 | 245 | 38 | 190 | 38 | 109 | 718 | 182 |

The "Citation becomes" column of section 2 is the mapping. F maps to
its new number. L maps to the Lean module that holds the rule, cited
as a path so the gate's `stale-path` rule checks it (a theorem name in
backticks would meet `stale-symbol`, which reads the port's code, not
Lean), or to a `docs/` page, or is deleted. P maps to the section of
the file that states it. R is deleted.

**The hazard, and why 101.** Renumbering from ADR-001 would have
reused numbers 001 to 014, so a stale citation of an old low number
would still resolve and silently name a different decision. Starting at
ADR-101 makes every old number fail the gate's `stale-adr` check.

**How it is done.** One script, driven by the table below, reads each
file once and maps each `ADR-0NN` and each `ADR.md#adr-0nn--slug`
anchor in a single regex pass with a callback, so no number is mapped
twice. An F number becomes its new number and anchor. Any other number
is removed: a parenthetical citation loses the citation (and the
parentheses when nothing else is left), a leading `ADR-0NN:` loses the
prefix, and a citation the sentence leans on is rewritten by hand, from
a reviewed table of exact replacements applied in the same pass.
`CHANGELOG.md` and `sketch/` are history and keep the old numbers.

| Old | New |
|---|---|
| 001, 017 | ADR-102 |
| 002 | ADR-103 |
| 003, 059, 060, 078 | ADR-105 |
| 010 | ADR-106 |
| 028, 029, 036 | ADR-107 |
| 038, 040, 079 | ADR-108 |
| 041 | ADR-104 |
| 044 | ADR-112 |
| 047, 068 | ADR-109 |
| 013, 019, 021 | ADR-110 |
| 020, 022 | ADR-111 |
| 069 | ADR-101 |
| every other number, and 024 and 039 | removed |

## 6. The maintainer's rulings

1. ADR-103 (100 % coverage) stays an ADR.
2. The new numbers start at ADR-101.
3. The drafted entries from 024 (forge token and proof contract) and
   039 (lock pins) are detail, not decisions: dropped from `ADR.md`,
   their substance stated in `docs/reference-packages.md`.
4. Docs homes for the dropped language and tool rules are not a
   precondition: `ADR.md` changes now.
5. An ADR is added only by the maintainer; an entry is at most 200
   words; an entry has no history, no status or superseding, no dates
   and no issue numbers. The header of `ADR.md` says so.

Still open: `aontu render` reads `$.out` by default (is that the
location ADR-106 forbids, or a CLI default it permits?), and ADR-102
keeps "TypeScript is canonical where the definition is silent" beside
ADR-101.

## 7. The migration as done

Every `ADR-0NN` in the aontu repository outside `sketch/`,
`CHANGELOG.md` and `ADR.md` was mapped in one pass by the table in
section 5, with 132 hand-reviewed exact replacements for the
citations a sentence leaned on. `ts/dist` and `ts/dist-test` were
rebuilt from the edited sources, not edited.

| Area | Renumbered | Removed or rewritten | All |
|---|---|---|---|
| `.github` | 3 | 8 | 11 |
| `admin` | 1 | 1 | 2 |
| `docs` | 13 | 8 | 21 |
| `go` | 28 | 105 | 133 |
| `spec` | 1 | 37 | 38 |
| `test` | 74 | 171 | 245 |
| top-level files | 21 | 7 | 28 |
| `ts/dist` (rebuilt) | 17 | 75 | 92 |
| `ts/dist-test` (rebuilt) | 11 | 13 | 24 |
| `ts/src`, `ts/scripts` | 28 | 96 | 124 |
| `ts/test` | 15 | 15 | 30 |
| `use-cases` | 37 | 153 | 190 |
| `web` | 0 | 2 | 2 |
| all | 249 | 691 | 940 |

The `module_local` hint cited the old ADR-022 in engine output, which
the style guide forbids; the citation was removed from the hint in
both ports and the web bundle rather than renumbered.

**Open: history links.** `ts/test/docs.test.ts`'s
`every-internal-link-resolves` reads `CHANGELOG.md` and
`sketch/capability-review/`, whose links into the old record
(`ADR.md#adr-0NN--…`) no longer resolve. Those files are history and
were left alone, so that test fails until one of these is chosen: point
those links at the old record's last commit
(`https://github.com/aontu-lang/aontu/blob/ae76d1f523ca9ea535a09a30952b2efc23efe181/ADR.md#adr-0NN--…`,
text untouched); drop their fragments; or let the test skip history
files.

## 8. Follow-up: the sibling repositories

The system, mod and web repositories cite aontu's old numbers, which
their comment gates leave unchecked. Listed from each repository's
`origin/main`; the open `adopt-agent-info` branches change some of
these lines, so re-run the list on whichever merges first. "Mechanical"
means the section 5 pass handles the line; "by hand" means the
sentence leans on the citation. `system/spec/registry.aontu` holds
the numbers as data (`renders: [...]`), so its change is a data change.
`web/test/worker.test.mjs` tests the comment gate's `elsewhere`
rule with `aontu ADR-011` as its example: replace it with a number
that exists, such as `aontu ADR-111`, and the same in
`web/ADR.md`'s header.

| Citation | Replacement | Pass |
|---|---|---|
| `system/.github/workflows/spec.yml:8` | ADR-001 → ADR-102 | mechanical |
| `system/docs/design/CLI.0.md:114` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/docs/design/CLI.0.md:293` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/CLI.0.md:294` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/CLI.0.md:476` | ADR-012 → remove | by hand |
| `system/docs/design/DISTRIBUTION.0.md:160` | ADR-012 → remove | by hand |
| `system/docs/design/DISTRIBUTION.0.md:167` | ADR-001 → ADR-102; ADR-002 → ADR-103 | mechanical |
| `system/docs/design/DISTRIBUTION.0.md:187` | ADR-013 → ADR-110 | mechanical |
| `system/docs/design/DISTRIBUTION.0.md:216` | ADR-001 → ADR-102 | mechanical |
| `system/docs/design/DISTRIBUTION.0.md:261` | ADR-013 → ADR-110 | mechanical |
| `system/docs/design/DISTRIBUTION.0.md:293` | ADR-013 → ADR-110 | mechanical |
| `system/docs/design/ENVIRONMENTS.0.md:273` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/LEGAL.0.md:25` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/LEGAL.0.md:104` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/LEGAL.0.md:234` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/LEGAL.0.md:236` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/LEGAL.0.md:290` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/LEGAL.0.md:435` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/LEGAL.0.md:547` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/LEGAL.0.md:627` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/LEGAL.0.md:628` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/LEGAL.0.md:632` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/README.md:28` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/README.md:100` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/README.md:110` | ADR-020 → ADR-111 | mechanical |
| `system/docs/design/README.md:134` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:134` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/REPOSITORY.0.md:207` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:278` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/REPOSITORY.0.md:438` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:547` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/REPOSITORY.0.md:680` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:700` | ADR-013 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:729` | ADR-001 → ADR-102 | mechanical |
| `system/docs/design/REPOSITORY.0.md:957` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1066` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:1301` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:1312` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1392` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1473` | ADR-022 → ADR-111 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1498` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1603` | ADR-012 → remove | by hand |
| `system/docs/design/REPOSITORY.0.md:1609` | ADR-012 → remove | by hand |
| `system/docs/design/REPOSITORY.0.md:1677` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1852` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1919` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:1927` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2000` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2077` | ADR-002 → ADR-103 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2080` | ADR-019 → ADR-110; ADR-021 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2090` | ADR-013 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2096` | ADR-019 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2108` | ADR-012 → remove | by hand |
| `system/docs/design/REPOSITORY.0.md:2109` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:2189` | ADR-013 → ADR-110 | mechanical |
| `system/docs/design/REPOSITORY.0.md:2207` | ADR-012 → remove | by hand |
| `system/docs/design/REPOSITORY.0.md:2216` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/design/REPOSITORY.0.md:2219` | ADR-019 → ADR-110 | mechanical |
| `system/docs/manual-tasks.md:45` | ADR-041 → ADR-104 | mechanical |
| `system/docs/manual-tasks.md:53` | ADR-041 → ADR-104 | mechanical |
| `system/docs/manual-tasks.md:404` | ADR-001 → ADR-102 | mechanical |
| `system/docs/manual-tasks.md:668` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/docs/manual-tasks.md:806` | ADR-041 → ADR-104 | mechanical |
| `system/docs/runbooks/key-custody.md:41` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/docs/runbooks/mirror-and-exit.md:5` | ADR-019 → ADR-110 | mechanical |
| `system/spec/README.md:77` | ADR-019 → ADR-110; ADR-020 → ADR-111; ADR-021 → ADR-110; ADR-022 → ADR-111; ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/README.md:116` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/README.md:353` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/README.md:430` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/README.md:441` | ADR-020 → ADR-111; ADR-022 → ADR-111 | mechanical |
| `system/spec/README.md:445` | ADR-019 → ADR-110; ADR-022 → ADR-111; ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/README.md:449` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/README.md:450` | ADR-021 → ADR-110 | mechanical |
| `system/spec/README.md:486` | ADR-019 → ADR-110 | mechanical |
| `system/spec/README.md:487` | ADR-020 → ADR-111; ADR-021 → ADR-110 | mechanical |
| `system/spec/README.md:488` | ADR-022 → ADR-111 | mechanical |
| `system/spec/README.md:489` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/README.md:502` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/README.md:541` | ADR-001 → ADR-102 | mechanical |
| `system/spec/README.md:564` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/acquire.aontu:3` | ADR-019 → ADR-110; ADR-020 → ADR-111 | mechanical |
| `system/spec/acquire.aontu:4` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/acquire.aontu:8` | ADR-019 → ADR-110 | mechanical |
| `system/spec/acquire.aontu:28` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/acquire.aontu:33` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/acquire.aontu:52` | ADR-020 → ADR-111 | mechanical |
| `system/spec/diagram.mjs:171` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/layout.aontu:2` | ADR-019 → ADR-110 | mechanical |
| `system/spec/layout.aontu:12` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/locked.aontu:2` | ADR-019 → ADR-110; ADR-021 → ADR-110 | mechanical |
| `system/spec/names.aontu:2` | ADR-020 → ADR-111; ADR-022 → ADR-111 | mechanical |
| `system/spec/names.aontu:7` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/names.aontu:10` | ADR-020 → ADR-111 | mechanical |
| `system/spec/names.aontu:14` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/names.aontu:55` | ADR-022 → ADR-111 | mechanical |
| `system/spec/names.aontu:57` | ADR-022 → ADR-111 | mechanical |
| `system/spec/names.aontu:78` | ADR-020 → ADR-111 | mechanical |
| `system/spec/objects.aontu:2` | ADR-019 → ADR-110 | mechanical |
| `system/spec/objects.aontu:3` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/objects.aontu:14` | ADR-012 → remove | by hand |
| `system/spec/objects.aontu:30` | ADR-012 → remove | by hand |
| `system/spec/params.aontu:12` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/params.aontu:34` | ADR-022 → ADR-111 | mechanical |
| `system/spec/params.aontu:50` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/params.aontu:53` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/params.aontu:54` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/params.aontu:55` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/params.aontu:56` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/params.aontu:57` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/params.aontu:59` | ADR-020 → ADR-111 | mechanical |
| `system/spec/private.aontu:2` | ADR-021 → ADR-110 | mechanical |
| `system/spec/private.aontu:28` | ADR-021 → ADR-110 | mechanical |
| `system/spec/publish.aontu:2` | ADR-019 → ADR-110; ADR-020 → ADR-111 | mechanical |
| `system/spec/publish.aontu:3` | ADR-022 → ADR-111; ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/publish.aontu:62` | ADR-019 → ADR-110 | mechanical |
| `system/spec/publish.aontu:63` | ADR-022 → ADR-111 | mechanical |
| `system/spec/publish.aontu:65` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/registry.aontu:18` | ADR-019 → ADR-110; ADR-022 → ADR-111 | mechanical |
| `system/spec/registry.aontu:19` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/registry.aontu:43` | ADR-019 → ADR-110 | mechanical |
| `system/spec/registry.aontu:49` | ADR-019 → ADR-110; ADR-020 → ADR-111; ADR-021 → ADR-110; ADR-022 → ADR-111; ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/registry.aontu:55` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/schema.aontu:21` | ADR-022 → ADR-111 | mechanical |
| `system/spec/schema.aontu:47` | ADR-020 → ADR-111 | mechanical |
| `system/spec/schema.aontu:56` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/schema.aontu:91` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/schema.aontu:142` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/schema.aontu:167` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/schema.aontu:177` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/schema.aontu:238` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/schema.aontu:271` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/schema.aontu:348` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/trust.aontu:2` | ADR-024 → remove, or point to aontu `docs/reference-packages.md`; ADR-019 → ADR-110 | by hand |
| `system/spec/trust.aontu:29` | ADR-019 → ADR-110 | mechanical |
| `system/spec/trust.aontu:33` | ADR-019 → ADR-110 | mechanical |
| `system/spec/trust.aontu:35` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/trust.aontu:47` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/vectors/first-seen-key.aontu:2` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/vectors/manifest-local-registry.aontu:2` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/vectors/manifest-missing-publisher.aontu:2` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/spec/vectors/names-major-in-path.aontu:2` | ADR-022 → ADR-111 | mechanical |
| `system/spec/vectors/package-file-repo.aontu:2` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/spec/withdraw.aontu:2` | ADR-019 → ADR-110 | mechanical |
| `system/worker/src/index.ts:7` | ADR-002 → ADR-103 | mechanical |
| `system/worker/src/proof.ts:7` | ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `system/worker/src/spec.generated.ts:2` | ADR-022 → ADR-111; ADR-020 → ADR-111; ADR-024 → remove, or point to aontu `docs/reference-packages.md`; ADR-039 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `system/worker/src/token.ts:3` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `mod/src/c2sp.ts:5` | ADR-019 → ADR-110 | mechanical |
| `mod/src/index.ts:32` | ADR-024 → remove, or point to aontu `docs/reference-packages.md` | by hand |
| `mod/src/keyproof.ts:3` | ADR-024 → remove, or point to aontu `docs/reference-packages.md`; ADR-039 → remove, or point to aontu `docs/reference-packages.md` | mechanical |
| `mod/src/note.ts:324` | ADR-002 → ADR-103 | mechanical |
| `web/src/worker.ts:60` | ADR-011 → remove | by hand |
| `web/test/worker.test.mjs:320` | ADR-011 → remove | by hand |

