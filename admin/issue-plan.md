# Plan for the open issues

What to do about the 131 issues open on 2026-11-19, after the triage of
[`issue-triage.md`](issue-triage.md). Fourteen issues were closed that
day. #431, found only partly fixed, stays open. The triage filed three,
and #836 tracks the rows the closed fixes still owe. Each open issue is in one workstream below, and the
workstreams fall into five phases, ordered by what each one unblocks and
by how many rows of `spec/ledger.tsv` it clears.

28 issues filed from 2026-11-19 to 2026-11-21 were added on 2026-11-22:
25 in the workstreams below, and three that ask for a change to the
language in [a workstream of their own](#with-the-lang-refinement-plan-three-language-changes).
The same day #894 was built and closed, and #907 was filed and placed.
136 issues are open after both.

## How each fix lands

- **A ruling comes before the code** wherever a fix waits on one
  (phase 0). Building to a guess is how a divergence gets baselined.
- **A fix lands with the shared row that pins it**, its expected value
  taken from both engines, and the definition's where it has one
  ([the parity probe](../docs/contributing/testing.md#the-parity-probe)).
  So does each issue closed on 2026-11-19 that still has no row.
- **A definition-side fix removes its ledger rows** in the same change,
  and lowers the ledger's bound in all three places it is held.
- **Progress is three numbers**: open issues (131 on 2026-11-19, 136
  on 2026-11-22), ledger rows (394 at most then, 55 on 2026-11-24),
  and entries in `test/spec/divergent.tsv`.

## Phase 0: decisions

Seven questions held up code. The project's owner ruled on all of them
on 2026-11-19, as rulings 59 to 68 of section 7 of
[`sketch/DEFINITION.0.md`](../sketch/DEFINITION.0.md), and only 62
is built, on 2026-11-21:

| # | the question | ruled | unblocks |
|---|---|---|---|
| [#738](https://github.com/aontu-lang/aontu/issues/738) | does a declaration have a place, or is its body read at each use as a template is? (five decisions) | 59 to 61: no place, the body read at each use; a call or a bound over a kind that fits its slot is a residual; a template is held to a declaration's check | the copies workstream, [#692](https://github.com/aontu-lang/aontu/issues/692), [#733](https://github.com/aontu-lang/aontu/issues/733), [#746](https://github.com/aontu-lang/aontu/issues/746) |
| [#818](https://github.com/aontu-lang/aontu/issues/818) | what a `match()` met with the map whose field it reads answers | 63: it reads the field | [#818](https://github.com/aontu-lang/aontu/issues/818), the trials in the generators workstream |
| [#535](https://github.com/aontu-lang/aontu/issues/535) | a conflict below an eager argument's top: `error`, as the ports answer, or `invalid`, as the definition reads | 62: `error`; the definition moved on 2026-11-21 | [#535](https://github.com/aontu-lang/aontu/issues/535) |
| [#457](https://github.com/aontu-lang/aontu/issues/457) | does a call's refusal show an argument as written or as driven? | 64: as written; with [#327](https://github.com/aontu-lang/aontu/issues/327), 65: a value is sited at its own span | [#457](https://github.com/aontu-lang/aontu/issues/457), and with [#327](https://github.com/aontu-lang/aontu/issues/327) every refusal inside a call |
| [#819](https://github.com/aontu-lang/aontu/issues/819) | the subsumption rule for a relation's members | 66: it subsumes where the range admits | [#819](https://github.com/aontu-lang/aontu/issues/819), `breaking` over relations |
| [#770](https://github.com/aontu-lang/aontu/issues/770) | case 1: a `type()` block declared empty and filled by statements | 67: as written whole | [#770](https://github.com/aontu-lang/aontu/issues/770) |
| [#733](https://github.com/aontu-lang/aontu/issues/733) | part: how coverage names a declaration and counts a taken one | 68: a declaration is no row, and its uses are counted | [#733](https://github.com/aontu-lang/aontu/issues/733) |

Ruled earlier and waiting only on the build: [#474](https://github.com/aontu-lang/aontu/issues/474) (decision 23), [#714](https://github.com/aontu-lang/aontu/issues/714)
(rulings 41 and 42, decision 43), [#743](https://github.com/aontu-lang/aontu/issues/743) (ruling 49), [#777](https://github.com/aontu-lang/aontu/issues/777) (the range
checks, 2026-11-17) and [#825](https://github.com/aontu-lang/aontu/issues/825) (`form`, cheapest before the next
release).

## Phase 1: quick wins

Each is a small fix in one engine or in the repository, and each fix
comes with its row. These take days, not weeks, and clear eighteen
issues:

- TypeScript: [#439](https://github.com/aontu-lang/aontu/issues/439), [#447](https://github.com/aontu-lang/aontu/issues/447), [#466](https://github.com/aontu-lang/aontu/issues/466), [#471](https://github.com/aontu-lang/aontu/issues/471), [#502](https://github.com/aontu-lang/aontu/issues/502), [#698](https://github.com/aontu-lang/aontu/issues/698), [#752](https://github.com/aontu-lang/aontu/issues/752), [#834](https://github.com/aontu-lang/aontu/issues/834)
- Go: [#451](https://github.com/aontu-lang/aontu/issues/451), [#514](https://github.com/aontu-lang/aontu/issues/514)
- both ports: [#832](https://github.com/aontu-lang/aontu/issues/832), [#833](https://github.com/aontu-lang/aontu/issues/833)
- the definition: [#826](https://github.com/aontu-lang/aontu/issues/826) and [#828](https://github.com/aontu-lang/aontu/issues/828), each a behaviour change, so each starts from the parity probe
- the repository: [#836](https://github.com/aontu-lang/aontu/issues/836) (the rows the closed fixes owe), [#813](https://github.com/aontu-lang/aontu/issues/813) (a `gofmt` gate), [#611](https://github.com/aontu-lang/aontu/issues/611) (a test that each prompt-log entry closes its fence), [#443](https://github.com/aontu-lang/aontu/issues/443)

## Phase 2: the rules with the most ledger rows

Four workstreams held 354 of the ledger's rows on 2026-11-19, and hold
22 of its 55 on 2026-11-24. In order:

1. **The alias-cycle rule** first: one static check, five issues, and
   it removes the TypeScript crash of #360. Built 2026-11-20, and all
   five are closed.
2. **Preferences and disjunction arms**: the largest, 178 rows then and
   18 now, already ruled.
3. **Seals and marks**: led by #726's bare `close()` and `open()`, with
   57 rows then and 6 now, ruled by decisions 44 to 46. #748 and #749
   here also unblock the relations workstream.
4. **Copies, bodies and templates**: #738 is ruled (rulings 59 to 61),
   and the work follows `sketch/CORE.0.md` §4. #504, #528 and #416 were
   built 2026-11-24, and 1 row is left of 78.

### The alias-cycle rule

5 issues (4 M, 1 L).

A name or a path that reaches itself consuming no key or element is a static `error` (decisions 1, 2 and 7). Both engines answer it as a cycle found while evaluating: `invalid`, a budget, or in TypeScript a stack overflow. One check, run before evaluation, clears the group. It was built on 2026-11-20, and the five issues are closed.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#329](https://github.com/aontu-lang/aontu/issues/329) | parity | M |  | A reference cycle through nof trial schemas is invalid in TypeScript and a unify_cycle error in Go. |
| [#354](https://github.com/aontu-lang/aontu/issues/354) | def | M |  | `%U = %U` answers invalid by unify_cycle in both ports; the definition rules a self-declared name an error. |
| [#357](https://github.com/aontu-lang/aontu/issues/357) | def | L |  | Self-reading paths answer unify_cycle (invalid) not error, and a recursive position met in place cycles instead of expanding. |
| [#360](https://github.com/aontu-lang/aontu/issues/360) | parity | M |  | A trial schema reading only its own name overflows the TypeScript stack on a container; Go answers invalid. |
| [#361](https://github.com/aontu-lang/aontu/issues/361) | def | M |  | A name reached through its own trial with nothing between is decided by the budget, not an error. |

### Preferences and disjunction arms

16 issues (5 S, 9 M, 2 L), 15 ledger rows.

How both engines read a preference, a lone preference and a live disjunction arm, against rulings 41 and 42 and decision 43. #714, the layers, was built and closed on 2026-11-20, and its rows left the ledger with most of #700's, #702's and #704's. #832 is the siting half of #482, and #857 is a clash the definition reads as no default.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#700](https://github.com/aontu-lang/aontu/issues/700) | def | L | 3 | A path in a live disjunction arm or lone preference waits; both ports say incomplete, the definition valid. |
| [#702](https://github.com/aontu-lang/aontu/issues/702) | def | M | 6 | Lone preference with an outside path: both ports' vet contradicts their own eval; definition sides with eval. |
| [#704](https://github.com/aontu-lang/aontu/issues/704) | def | M | 6 | A lone preference's parent arm lifts a path inside it to any, not the parent type it reads. |
| [#714](https://github.com/aontu-lang/aontu/issues/714) | def | L |  | Meeting preferences of different ranks drops the higher rank's constraint and default; rulings 41, 42, decision 43. |
| [#482](https://github.com/aontu-lang/aontu/issues/482) | def | M |  | A made default clash (`pref(1 \| 2)`, meets) reads invalid under vet, where a written clash is error. Built in both ports 2026-11-24. |
| [#719](https://github.com/aontu-lang/aontu/issues/719) | diag | S |  | TypeScript leaks the internal trial-nil sentinel, unsited, where Go answers `pref_rank_clash`. |
| [#349](https://github.com/aontu-lang/aontu/issues/349) | bug | S |  | `*(` before a literal container reads as an implicit bag: an error alone, silently dropped in a disjunction. |
| [#348](https://github.com/aontu-lang/aontu/issues/348) | parity | M |  | Disjunction arms written differently but generating the same value: Go generates it, TypeScript answers disjunct_no_gen. |
| [#832](https://github.com/aontu-lang/aontu/issues/832) | parity | S |  | A made default's pref_rank_clash: Go sites $, TypeScript loses the position. |
| [#431](https://github.com/aontu-lang/aontu/issues/431) | bug | S |  | A concrete value lost to a default by declaration order (`**default`, value, `*default`). |
| [#857](https://github.com/aontu-lang/aontu/issues/857) | def | M |  | Two same-rank defaults, each narrowed by a bound that refuses the other's, clash as `pref_rank_clash` when written as one meet; the definition reads no default (decision 43). |
| [#953](https://github.com/aontu-lang/aontu/issues/953) | bug | M |  | A default arm over a path not read yet admits what its parent type admits, so `(*$.a \| "a") & 3` is `3` or `empty` by the order of the statements, and `vet` admits data the schema refuses. Built in both ports 2026-11-24. |
| [#954](https://github.com/aontu-lang/aontu/issues/954) | design | M |  | A default that reaches a disjunction through `pref()`, a path or a name: the definition keeps its parent type as an arm, both engines mostly don't. Ruled as 89: an arm at its rank, with no parent type, however it got there. |
| [#955](https://github.com/aontu-lang/aontu/issues/955) | def | M |  | A disjunction ranks its defaults pair by pair as parsed, so `**1 \| **2 \| *3 \| number` clashes where `*3 \| **1 \| **2 \| number` is `3`, and two map defaults fold only where they stand together. |
| [#956](https://github.com/aontu-lang/aontu/issues/956) | def | M |  | Two defaults of one rank clash as soon as they meet, before a later schema term settles between them: `(*1 \| *7) & 1` is `pref_rank_clash`, where the definition reads `1`. |
| [#957](https://github.com/aontu-lang/aontu/issues/957) | design | S |  | Two clashing defaults in a spread's template: both engines refuse every member the data gives, the definition admits one that picks an arm. Ruled as 90: the schema's error, where it is written. |

### Seals, marks, moves and generation-time checks

12 issues (1 S, 8 M, 3 L), 6 ledger rows.

A seal, a mark or a move, and the checks that wait for generation: #726 (bare `close()` and `open()`, decisions 44 to 46) carries 6 rows. #748 and #749 (a path into a container met with a deferred atom or a seal) also block the relations workstream.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#726](https://github.com/aontu-lang/aontu/issues/726) | def | L | 6 | Bare `close()`/`open()` act on their own conjunct, not on the place's met terms (decisions 44–46). Built in both ports 2026-11-23 but for a directive beside a path: the root, a template's own level, a call's argument, a member held open, and every term at the place. |
| [#749](https://github.com/aontu-lang/aontu/issues/749) | bug | M |  | close() or open() wrapping a map whose member reads a sibling never resolves: mapval_no_gen. Built in both ports 2026-11-24. |
| [#748](https://github.com/aontu-lang/aontu/issues/748) | bug | L |  | Paths into a container met with len, unique, when, must, nof, contains or rest resolve to nothing. |
| [#817](https://github.com/aontu-lang/aontu/issues/817) | def | M |  | Generation-time checks (len, contains, when) never run under `hide()` or `type()`; definition reads invalid. |
| [#540](https://github.com/aontu-lang/aontu/issues/540) | def | S |  | A hide(nil) list element keeps its position in both engines; the definition drops it |
| [#633](https://github.com/aontu-lang/aontu/issues/633) | def | M |  | A mark on a generator's source reaches every instance in both engines; definition reads through it. |
| [#668](https://github.com/aontu-lang/aontu/issues/668) | bug | M |  | `move` of a list element drops it from output, but vet keeps its position; output fails vet. |
| [#346](https://github.com/aontu-lang/aontu/issues/346) | def | M |  | `close([1, 2])` met with `[&: integer]` loses its fixed length and admits `[1, 2, 3]` in both ports. Built in both ports 2026-11-24. |
| [#343](https://github.com/aontu-lang/aontu/issues/343) | def | M |  | `string & (string & empty())` admits the empty string in both ports; the definition refuses it. |
| [#770](https://github.com/aontu-lang/aontu/issues/770) | parity | L |  | type() block filled by statements answers unlike the whole block, ports split five ways; case 1 ruled (67). |
| [#486](https://github.com/aontu-lang/aontu/issues/486) | parity | M |  | move with a meta/hide rider: TS and Go split on vet data overriding the copy |
| [#937](https://github.com/aontu-lang/aontu/issues/937) | def | M |  | A check that waits for generation is judged or not by key order when a sibling can't generate. |

### Where copies, bodies and templates read paths and key()

21 issues (1 S, 18 M, 2 L), 1 ledger row.

Where a copy, a declaration's body or a template reads its relative paths and `key()`: the two notions of where that `sketch/CORE.0.md` §4 plans to make one. #504 was built in both ports on 2026-11-24, its 54 rows gone, and the same change answers #692, #696, #463 and #330, and #520 where a path lands above its target. #528 was built in both ports the same day, with the emit rows of #539, the rest of #520 and #783, its 12 rows gone; it found #942 and #943, both in the definition, and #944 in TypeScript. #738 is ruled: a declaration has no place, and its body is read at each use (ruling 59).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#463](https://github.com/aontu-lang/aontu/issues/463) | def | L |  | `key()` copied through a reference shallower than its target reads a stale target segment. Answered by #504's build, 2026-11-24. |
| [#465](https://github.com/aontu-lang/aontu/issues/465) | def | M |  | `key()` under a preference never resolves; TS silently drops the field, Go answers `no_gen`. |
| [#500](https://github.com/aontu-lang/aontu/issues/500) | def | M |  | Relative path in a spread template names nothing at members a link or copy makes |
| [#501](https://github.com/aontu-lang/aontu/issues/501) | parity | M |  | Alias body's relative spread used at the top: TS no_path, Go valid |
| [#504](https://github.com/aontu-lang/aontu/issues/504) | def | L |  | Relative path in alias body or path-reference copy reads by source order; ruling 26 says at copy. Built in both ports 2026-11-24. |
| [#520](https://github.com/aontu-lang/aontu/issues/520) | def | M |  | Path into generator output or landing above its target rereads key() wrongly, both engines. The landing half is answered by #504's build, and the path into a generator's output by #528's, both 2026-11-24. |
| [#528](https://github.com/aontu-lang/aontu/issues/528) | def | M |  | key(n) in a declaration body reads the internal name %T@file, so fitting bodies error. Built in both ports 2026-11-24. |
| [#539](https://github.com/aontu-lang/aontu/issues/539) | def | M |  | key() after an absent list element reads the written index, not the element's position. The emit rows are built in both ports, 2026-11-24; the plain list is left. |
| [#942](https://github.com/aontu-lang/aontu/issues/942) | def | M |  | The definition admits an unused declaration whose key reads inside its own body and clashes there; both engines refuse it. Ruled as 88: the definition moves. Built in the definition 2026-11-24 for six of the seven cases; a key inside the body that a relative path reads is left. |
| [#943](https://github.com/aontu-lang/aontu/issues/943) | def | M |  | The definition keeps a marked element of a list in a declaration's body when the name is read, and drops its mark. Fixed in the definition 2026-11-24. |
| [#944](https://github.com/aontu-lang/aontu/issues/944) | parity | M |  | A copy of `sum`, `least`, `greatest`, `sort`, `pick` or `join` over a relative path keeps the target's value in TypeScript; Go and the definition make the call again. Fixed in TypeScript 2026-11-24. |
| [#946](https://github.com/aontu-lang/aontu/issues/946) | parity | M |  | A copied `each`, `pack` or `filter` over a relative source, the copy written first at another depth: the engines differ, and where the copy is shallower Go changes the target's own value. Fixed in Go 2026-11-24. |
| [#330](https://github.com/aontu-lang/aontu/issues/330) | diag | M |  | A key missing under a reference to a deeper target is reported at a nonexistent path. Answered by #504's build, 2026-11-24. |
| [#692](https://github.com/aontu-lang/aontu/issues/692) | parity | M |  | A name bound to a multi-step path, written first, misreads the target's relative paths; TS and Go differ. Answered by #504's build, 2026-11-24. |
| [#698](https://github.com/aontu-lang/aontu/issues/698) | parity | S |  | TypeScript places a relative path in a `match` result under a NaN step; Go matches the definition. |
| [#696](https://github.com/aontu-lang/aontu/issues/696) | parity | M |  | Go's vet reads a template copied by a path reference twice, conflicting; TypeScript reads it once. Answered by #504's build, 2026-11-24. |
| [#765](https://github.com/aontu-lang/aontu/issues/765) | def | M |  | eval reads deeper recursion levels' relative paths at the body's place; vet and definition read them per level. |
| [#762](https://github.com/aontu-lang/aontu/issues/762) | def | M | 1 | Recursive name used alone whose body links to its own member: engines expand it (valid), definition says incomplete. |
| [#691](https://github.com/aontu-lang/aontu/issues/691) | def | M |  | A map spread's template cannot read a sibling it supplies at a member written in the same map. |
| [#416](https://github.com/aontu-lang/aontu/issues/416) | def | M |  | A path inside a rider's value to a sibling member leaves both ports incomplete (`mapval_no_gen`). Built in both ports 2026-11-24. |
| [#936](https://github.com/aontu-lang/aontu/issues/936) | def | M |  | A copied `each` or `pack` reads a relative path in its source where the target stands, not where the copy stands. |

## Phase 3: by area

These have fewer ledger rows. Their order inside the phase is free; the
relations workstream depends on #748 and #749 from phase 2.

### Relations

16 issues (4 S, 7 M, 5 L), 21 ledger rows.

First the relations whose range names a subtype (#771, #778, #779, #780), then the ruled range check of #777, which needs #748. #491 and #811 are where `vet` and evaluation read a relation differently, and #878 where the graph atoms miss the edges a default brings; rulings 72 and 73 settle when the atoms judge.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#771](https://github.com/aontu-lang/aontu/issues/771) | bug | M |  | relate() whose template is a subtype built from the declaring type is unify_cycle at the declaration, even unused. |
| [#778](https://github.com/aontu-lang/aontu/issues/778) | def | L | 15 | Two path definitions, one a meet over the other, generate, stay unresolved or cycle by writing order. |
| [#779](https://github.com/aontu-lang/aontu/issues/779) | bug | M |  | Relation range naming a subtype is held by name and unfolded once; `subsume` then answers undecided. |
| [#780](https://github.com/aontu-lang/aontu/issues/780) | parity | L |  | Table of two subtypes with subtype-ranged relation: TypeScript refuses valid data as empty; Go never terminates. |
| [#777](https://github.com/aontu-lang/aontu/issues/777) | design | L |  | Proposal: a relation's range checks its target instead of meeting into it; ruled 2026-11-17 for checking, unbuilt. |
| [#661](https://github.com/aontu-lang/aontu/issues/661) | def | M | 6 | Engines read a link template's relative path values where written; ruling 50 reads them at the target. |
| [#542](https://github.com/aontu-lang/aontu/issues/542) | def | M |  | A container a later meet brings into a relation holds no link in both engines |
| [#811](https://github.com/aontu-lang/aontu/issues/811) | def | M |  | `relate()` met with a scalar kind waits as incomplete in both ports; definition reads error. |
| [#810](https://github.com/aontu-lang/aontu/issues/810) | bug | L |  | Link under a key containing a dot gets an address another path shares; reaches and acyclic misread it. |
| [#815](https://github.com/aontu-lang/aontu/issues/815) | diag | S |  | `relation_cycle` finding names the first edge out of the cycle's first node, possibly off the cycle. |
| [#773](https://github.com/aontu-lang/aontu/issues/773) | diag | S |  | relation_cycle frame loses the edge when the member meets a waiting constraint: TS frames nil, Go whole member. |
| [#746](https://github.com/aontu-lang/aontu/issues/746) | diag | S |  | Pattern beside `relate()` in a declaration from another source: Go paths it `$.%P`, TypeScript the member. |
| [#491](https://github.com/aontu-lang/aontu/issues/491) | bug | M |  | vet answers valid where eval refuses with relation_cycle or relation_inverse_missing, both engines |
| [#878](https://github.com/aontu-lang/aontu/issues/878) | def | M |  | acyclic() and inverse(k) don't judge the edges a default brings; ruling 72 says they judge the generated edges. |
| [#752](https://github.com/aontu-lang/aontu/issues/752) | parity | S |  | Member's relative address under an in-place template link: TypeScript refuses ..b and ...b, Go links correctly. |
| [#819](https://github.com/aontu-lang/aontu/issues/819) | design | L |  | No subsumption rule for a relation's member template against a linked member; `breaking` stays undecided. |

### Path steps and path values

5 issues (2 S, 2 M, 1 L).

Path steps carried as text: a structural step closes #471, #472 and #475 together. #474 is ruled (decision 23), and #479 is narrowed to five items.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#471](https://github.com/aontu-lang/aontu/issues/471) | parity | S |  | TS reads a path step unchecked: null binding names `"null"`, list step yields array properties. |
| [#472](https://github.com/aontu-lang/aontu/issues/472) | def | M |  | A quoted path step `"."` reads as a parent climb in both ports, not key `"."`. |
| [#475](https://github.com/aontu-lang/aontu/issues/475) | bug | S |  | `path()` capture splits a quoted key holding a dot into two steps, in both ports. |
| [#474](https://github.com/aontu-lang/aontu/issues/474) | def | M |  | A path value met with a string constraint answers by meet order; ruled, ports must move. |
| [#479](https://github.com/aontu-lang/aontu/issues/479) | def | L |  | `maybe()`: both ports read absence unlike the definition in several shapes (conflicts, missing arms, negation). |

### Generators, folds and trials

23 issues (3 S, 20 M).

Generators that cannot read the member they make (#754) or their own enclosing bag (#751), `key(n)` in an `emit` template (#783, #786), the trial question of #818, ruled as 63 and built 2026-11-22, and three findings of decision 62's build, ruled 2026-11-22: #892, a conflict below the top of a trial argument read against a value, which makes the whole argument admit nothing (74, built in the definition the same day), #894, a written `nil` below the top of `must`'s condition, which reads as ruling 54 reads it (75, built in both ports the same day, but for an arm that holds one, #907), and #895, a path in `must`'s condition into the value under trial, which reads the field as 63 reads one in `match` (76, built the same day), and #917, the same path written as a relative one, fixed the same day; #919, a pattern that reads the match's own place, and #922, what a scrutinee holding a `type()` or `hide()` member selects by, both ruled 2026-11-22 (85: the pattern reads the field; 86: the scrutinee's output). The newer ones: an unknown call that is silent in a trial (#870, ruled as 77), a default inside a map that a trial misses (#847, ruled as 78), three TypeScript failures on a relative reference in `match` and `maybe` (#850, #868, #871), and the keyed projection the lang refinement plan builds (#861).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#751](https://github.com/aontu-lang/aontu/issues/751) | bug | M |  | Generator over its own enclosing bag refused as not a bag (filter_data etc.); misdiagnosed, often acyclic. |
| [#754](https://github.com/aontu-lang/aontu/issues/754) | bug | M |  | Filter condition in a member pack, each or apply makes cannot read the member: answers empty, no error. |
| [#783](https://github.com/aontu-lang/aontu/issues/783) | parity | M |  | Bare `key(n)` in a named emit table's body reads the body index in TypeScript at top level. Answered by #528's build, 2026-11-24. |
| [#786](https://github.com/aontu-lang/aontu/issues/786) | parity | M |  | `key(n)` in an emit template's `replace` value climbs one level less in Go than TypeScript. |
| [#466](https://github.com/aontu-lang/aontu/issues/466) | parity | S |  | TS `pack` keeps only the first colliding instance, losing riders; Go unifies them. |
| [#812](https://github.com/aontu-lang/aontu/issues/812) | parity | M |  | `must()` reading siblings in a spread template is `no_path` in TypeScript; Go and definition read per member. |
| [#818](https://github.com/aontu-lang/aontu/issues/818) | def | M |  | `match()` met with the map whose field it reads never settles: incomplete in ports, error in definition. Built in the definition 2026-11-22 (`Val.dropSelf`) and in both ports the same day. |
| [#743](https://github.com/aontu-lang/aontu/issues/743) | def | M |  | A `match` over an open scrutinee is refused before data; ruling 49 says wait for the data. Built in both ports 2026-11-23. |
| [#527](https://github.com/aontu-lang/aontu/issues/527) | def | S |  | neq over a nested list written in place expands it twice; path form expands once |
| [#892](https://github.com/aontu-lang/aontu/issues/892) | def | M |  | A conflict below the top of a trial argument read against a value: both ports make the argument admit nothing, the definition reads it in place. Ruled as 74: the whole argument admits nothing, so the definition moves. Built 2026-11-22. |
| [#894](https://github.com/aontu-lang/aontu/issues/894) | def | M |  | A written `nil` below the top of `must`'s condition refuses every value in both ports (`invalid-arg`), where ruling 54 reads it where it stands. Ruled as 75: `must` reads it as ruling 54 does, so both ports drop the builder's check. Built 2026-11-22; rows tn9 to tn11 moved to #907. |
| [#907](https://github.com/aontu-lang/aontu/issues/907) | def | M |  | A disjunction arm that holds a written `nil` doesn't refuse once the data meets it, in either port, so `v: {x: 1} \| {x: nil}` refuses `{"v": {"x": 1}}`; the definition admits it. Fixed in both ports 2026-11-22. |
| [#895](https://github.com/aontu-lang/aontu/issues/895) | def | M |  | A path in `must`'s condition into the value under trial: both ports leave it unread and pass the check, the definition reads `error` or `invalid`. Ruled as 76: the path reads the field, as 63 reads one in `match`, so both ports and the definition move. Built in the definition 2026-11-22 and in both ports the same day. |
| [#917](https://github.com/aontu-lang/aontu/issues/917) | def | S |  | A relative path in `must`'s condition into the value under trial, `.name` in `v: must({x: .name}, "m")`, is unread in both ports, where the definition reads it as the absolute one. Fixed in both ports 2026-11-22. |
| [#919](https://github.com/aontu-lang/aontu/issues/919) | def | M |  | A `match` pattern that reads the match's own place: both ports wait, the definition answers `error`. Ruled as 85: the pattern reads the field, as 63 reads the scrutinee, so the definition and both ports move. Built in the definition and both ports 2026-11-23. |
| [#922](https://github.com/aontu-lang/aontu/issues/922) | def | M |  | A scrutinee holding an open `type()` or `hide()` member keeps a `match` waiting in the definition, which reads the whole value, where both ports match at once. Ruled as 86: a `match` selects by what its scrutinee outputs, so the definition moves and both ports leave marked members out of the wait; 2026-11-23, no exception for a path, which copies its target without its marks. Built in the definition and both ports 2026-11-23. |
| [#847](https://github.com/aontu-lang/aontu/issues/847) | bug | M |  | `filter` and `match` miss a default inside a map: the member is dropped or another arm taken, with no finding. Ruled as 78: the trial reads the value the member generates. |
| [#870](https://github.com/aontu-lang/aontu/issues/870) | bug | M |  | A call to an unknown name, or with a wrong count, is silent inside a trial, in a disjunction's arm and under `maybe`. Ruled as 77: refused wherever it stands. Built 2026-11-22 in both ports, and 2026-11-24 in the definition. |
| [#850](https://github.com/aontu-lang/aontu/issues/850) | parity | M |  | A `match` whose result is a relative reference overflows the TypeScript stack; Go answers. |
| [#868](https://github.com/aontu-lang/aontu/issues/868) | parity | M |  | A `match` whose pattern is a relative reference overflows the TypeScript stack, and a bound over it is `mapval_no_gen`; Go answers both. The bound is fixed 2026-11-22; the overflow is the parser defect of #326, fixed upstream in tabnas/expr#121. |
| [#871](https://github.com/aontu-lang/aontu/issues/871) | parity | M |  | `maybe(v)` of a relative reference as a call's second or later argument never resolves in TypeScript; Go answers. Fixed 2026-11-22, with the second case of #868. |
| [#861](https://github.com/aontu-lang/aontu/issues/861) | design | M |  | No single call projects one field of each member into a map that keeps the source's keys. C1 and C2 of the lang refinement plan: `at`, and a key for `pack`. |
| [#938](https://github.com/aontu-lang/aontu/issues/938) | def | M |  | A `match` over a kind can't walk a schema since ruling 49 was built; use case 10's transforms waited on a ruling. Ruled as 87: an arm is taken where every value the scrutinee admits satisfies its pattern, the next is read where they share nothing, and the `match` waits otherwise. Built in the definition and both ports 2026-11-24, reading the order `subsume` asks. |
| [#962](https://github.com/aontu-lang/aontu/issues/962) | def | M |  | The definition's `filter` drops a member whose bound sits inside the condition's looser bound, where both ports keep it: `filterTakes` compares the member with its meet letter for letter. `certainArm` reads the order by `leDecF` since #938, and `filterTakes` and `emitTakes` could too. |
| [#963](https://github.com/aontu-lang/aontu/issues/963) | def | M |  | A `match` pattern that holds a default refuses the default's own value in both ports: `match(1, *1, "T", "D")` is `"D"` where `match(2, *1, "T", "D")` is `"T"`. The canon comparison keeps the mark. |
| [#964](https://github.com/aontu-lang/aontu/issues/964) | def | M |  | A `match` passes over a pattern whose optional member clashes with the scrutinee's own, though the value generated has neither: both ports try the pattern against the term, the definition against the output. |
| [#965](https://github.com/aontu-lang/aontu/issues/965) | def | M |  | A `match` tries a sealed pattern, or one that names the member, against a `type()` or `hide()` member of the scrutinee, which the output leaves out (both ports). #922 built the rule for a pattern that leaves the member alone. |

### Declarations, loads, includes and built-in models

18 issues (4 S, 13 M, 1 L).

Faults at an include or a built-in model's boundary, which lose structure or a site, and the declaration questions #738 rules on. Five of the newer ones are one question, the file a value from an include is sited in (#841, #845, #876, #887, with #734 and #658 above), and #889 is a file that is not valid UTF-8.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#738](https://github.com/aontu-lang/aontu/issues/738) | design | L |  | Proposal: a declaration has no place; its body is read at each use like a template. |
| [#502](https://github.com/aontu-lang/aontu/issues/502) | parity | M |  | @ before a non-string operand crashes TS, Go names no source; binding of @ needs ruling |
| [#514](https://github.com/aontu-lang/aontu/issues/514) | parity | M |  | Go leaks a document alias into output or meets it with a root-loaded file's alias |
| [#517](https://github.com/aontu-lang/aontu/issues/517) | bug | M |  | Spaced name set in export publishes nothing, and as destructure head fails with no_path |
| [#518](https://github.com/aontu-lang/aontu/issues/518) | diag | S |  | Destructure as a list element: TS refuses alias_not_toplevel, Go fails to parse |
| [#658](https://github.com/aontu-lang/aontu/issues/658) | diag | S |  | A site in a built-in model frames the entry document's lines in TypeScript; Go frames the model. |
| [#730](https://github.com/aontu-lang/aontu/issues/730) | parity | M |  | Including a file that holds a destructure head makes the whole document nil in Go; TypeScript reads it. |
| [#731](https://github.com/aontu-lang/aontu/issues/731) | bug | M |  | An included file whose root is a list is silently dropped at a map root; parity faults too. |
| [#734](https://github.com/aontu-lang/aontu/issues/734) | diag | S |  | A `pref_not_instance` lint for a default in an included file names the entry document, differently per port. |
| [#804](https://github.com/aontu-lang/aontu/issues/804) | parity | M |  | Go evaluates a document including a source that writes a destructure as nil, `parse_unknown` at `$`. |
| [#805](https://github.com/aontu-lang/aontu/issues/805) | bug | M |  | Evaluation accepts an unused body's destructure of an unexported name that vet refuses, in both ports. |
| [#616](https://github.com/aontu-lang/aontu/issues/616) | diag | M |  | Use case 18: list template met with a string reports `list` in TypeScript, `scalar_kind` in Go. |
| [#842](https://github.com/aontu-lang/aontu/issues/842) | parity | M |  | A file that holds a destructure head, included under a key, is `no_path` in TypeScript and `alias_not_toplevel` in Go. Ruled, plan ruling 36: the file is whole where it lands. |
| [#841](https://github.com/aontu-lang/aontu/issues/841) | diag | S |  | An `export_arg` refusal in a file included at the root is framed in that file by TypeScript and at the entry document's 1:1 by Go. Plan ruling 50 sites it in its own file. |
| [#845](https://github.com/aontu-lang/aontu/issues/845) | diag | M |  | A refusal over a value loaded at a value position frames it at the `@` in TypeScript and in its own file in Go. Plan ruling 50 sites it in its own file. |
| [#876](https://github.com/aontu-lang/aontu/issues/876) | diag | M |  | A syntax error inside an included data file is reported in the including file, differently in each port. Plan ruling 50 sites it in its own file. |
| [#887](https://github.com/aontu-lang/aontu/issues/887) | diag | M |  | A `vet` finding's value from an included data file is sited in the including document by TypeScript and in the data file by Go, both at `-1:-1`. Plan ruling 50 sites it in its own file. |
| [#889](https://github.com/aontu-lang/aontu/issues/889) | parity | M |  | Adjacent invalid UTF-8 sequences become one U+FFFD in Go and one each in TypeScript, so the ports hash one file differently. Ruled as 82: such a file is refused. |

### subsume and breaking

5 issues (2 S, 3 M).

The `subsume` and `breaking` gaps besides relations: a range inside a template (#321), recursive lists (#387), defaults at a list position (#424), and the missing finding for a document that does not stand up (#774, with #755).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#321](https://github.com/aontu-lang/aontu/issues/321) | bug | M |  | breaking and subsume answer undecided for any range change inside a spread template; outside one they decide. |
| [#387](https://github.com/aontu-lang/aontu/issues/387) | def | M |  | subsume says a recursive list subsumes `[integer, any]`, though `[1, 5]` is a witness against it. |
| [#424](https://github.com/aontu-lang/aontu/issues/424) | def | S |  | `subsume` under defaults ignores a default at a list position in both ports. Built in both ports 2026-11-24. |
| [#774](https://github.com/aontu-lang/aontu/issues/774) | diag | S |  | subsume and breaking answer verdict error, exit 4, with no finding naming the failing document or cause. |
| [#735](https://github.com/aontu-lang/aontu/issues/735) | diag | M |  | `subsume`/`breaking` lose a meet member's site: TypeScript writes -1:-1, Go 1:1. |

### Scalars and generated output

9 issues (5 S, 4 M).

Small parity faults in builtins, #825's `form`, which is cheapest before the next release, and two additions the lang refinement plan rules on: Markdown conventions for `esc` and `usc` (#848) and a fallback for `maybe` (#849).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#439](https://github.com/aontu-lang/aontu/issues/439) | parity | S |  | TS refuses a biginteger `upper`/`lower` index from 2^53; Go accepts up to int64. |
| [#447](https://github.com/aontu-lang/aontu/issues/447) | parity | S |  | `split` of the empty string at a non-empty pattern: TS gives `[]`, Go `[""]`. |
| [#451](https://github.com/aontu-lang/aontu/issues/451) | parity | S |  | `nom` with style `""`: Go answers all spellings, TS refuses `invalid-arg`, as the reference reads. |
| [#756](https://github.com/aontu-lang/aontu/issues/756) | parity | S |  | join over a list holding a path value: TypeScript joins its spelling, Go leaves it unresolved (mapval_no_gen). |
| [#825](https://github.com/aontu-lang/aontu/issues/825) | design | M |  | Ruled: rename gen notation options `as`, `case`, `keys` to `form` across model, ports, rows, docs. |
| [#395](https://github.com/aontu-lang/aontu/issues/395) | bug | S |  | Canon drops the meta() record from a spread template that comes from an alias, in both ports. |
| [#319](https://github.com/aontu-lang/aontu/issues/319) | bug | M |  | allOf members typing one property differently import as nil, refusing every object instead of forbidding the key. |
| [#848](https://github.com/aontu-lang/aontu/issues/848) | design | M |  | `esc` and `usc` have no convention for Markdown. Ruled, plan ruling 41: `md`, `mdcell` and `mdcode`. |
| [#849](https://github.com/aontu-lang/aontu/issues/849) | design | M |  | No rule can fall back when a member's field is absent. Ruled, plan ruling 40: `maybe(v, fallback)`. |

### Parser limits

3 issues (3 M).

The pinned `@tabnas/expr` overflows. The retest was run on 2026-11-21 with every pin raised, `@tabnas/expr` at 0.6.4: the three documents of #325 answer as Go does, and #326 gets worse, the TypeScript engine running out of memory after about fifty seconds where it overflowed its stack at once. So #326 needs a fix of its own before the pin moves, which `docs/contributing/parity.md` keeps exact on purpose. [The table](../sketch/LANG-REFINEMENT-PLAN.0.md#what-the-pins-do-to-the-parser-issues) is in the lang refinement plan. #853 is the unifier's stack and was not part of that run.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#325](https://github.com/aontu-lang/aontu/issues/325) | parity | M |  | A flat operator chain of about 1,950 members overflows the TypeScript parser stack; Go parses it. |
| [#326](https://github.com/aontu-lang/aontu/issues/326) | parity | M |  | `neq(-1, -2, -3)` overflows the TypeScript parser stack, where Go evaluates it; upstream @tabnas/expr defect. |
| [#853](https://github.com/aontu-lang/aontu/issues/853) | parity | M |  | A chain of 5,000 absolute paths overflows the TypeScript unifier's stack and is reported as `internal`; Go answers `budget_passes`. |

## Phase 4: diagnostics and tooling

### Diagnostics: sites, messages and frames

17 issues (10 S, 7 M).

Seventeen issues where the verdict agrees and a code, site, frame or message does not. Rulings 64 and 65 settle #457 and #327, a refusal drawing a call as written and a value sited at its own span, and with them #331, #391 and #685. Each needs a row in the full-message twin tests.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#313](https://github.com/aontu-lang/aontu/issues/313) | diag | S |  | `upper(1, 2)` headline reads "Cannot range values" in TS, "Cannot resolve value" in Go; code and hint agree. |
| [#324](https://github.com/aontu-lang/aontu/issues/324) | diag | M |  | A refusal frame cuts a source line over 333 characters in TypeScript and prints it whole in Go. |
| [#327](https://github.com/aontu-lang/aontu/issues/327) | diag | M |  | An unresolved reference in a call's first argument is sited at different columns in each port. |
| [#328](https://github.com/aontu-lang/aontu/issues/328) | diag | M |  | A refused operand met from the 2020-12 meta-schema's vocabularies names a different ident() site in each port. |
| [#331](https://github.com/aontu-lang/aontu/issues/331) | diag | M |  | An alias refusal for a hoisted value or included map is framed at different columns in each port. |
| [#332](https://github.com/aontu-lang/aontu/issues/332) | diag | S |  | An alias reference in an uninstantiated nested template is refused at `$.x.&.&` in TypeScript, `$.x.&` in Go. |
| [#333](https://github.com/aontu-lang/aontu/issues/333) | diag | S |  | A bare-punctuation refusal in a top-level list names `$.0` in TypeScript and `$.1` in Go. |
| [#391](https://github.com/aontu-lang/aontu/issues/391) | diag | S |  | A refusal inside meta() or deprecate() over a disjunction is sited at different columns in each port. |
| [#685](https://github.com/aontu-lang/aontu/issues/685) | diag | S |  | A call whose name holds `=` is sited at the `=` in TypeScript, at the name in Go. |
| [#772](https://github.com/aontu-lang/aontu/issues/772) | diag | S |  | Go reports an unfilled member of a multi-step reference's copy at a path keeping the reference's steps, $.v.C.n. |
| [#755](https://github.com/aontu-lang/aontu/issues/755) | diag | S |  | Errors finding of relations, reaches, view, trim, jsonschema names included files absolutely; Go loses the position (-1:-1). |
| [#775](https://github.com/aontu-lang/aontu/issues/775) | diag | M |  | Refusal inside the one disjunction arm the data selects is reported as empty at the member, naming nothing. |
| [#457](https://github.com/aontu-lang/aontu/issues/457) | diag | M |  | A call's refusal renders a driven argument by value in TS, as written in Go. |
| [#840](https://github.com/aontu-lang/aontu/issues/840) | diag | M |  | Under `vet`, a field met with a destructured name and a literal reports `no_scalar_unify` at the name's body in TypeScript and `scalar_kind` at the literal in Go. |
| [#846](https://github.com/aontu-lang/aontu/issues/846) | diag | S |  | A parse error on the empty line after a source's last newline draws its caret a line lower in Go. |
| [#852](https://github.com/aontu-lang/aontu/issues/852) | diag | S |  | A path with an unbound variable step is refused as `unknown_var` nine times in TypeScript and once in Go. |
| [#866](https://github.com/aontu-lang/aontu/issues/866) | diag | S |  | A `deprecated` finding on a preference inside `deprecate()` is sited at the `*` in TypeScript and a column earlier in Go. |

### Tooling: coverage, LSP, CLI, playground, docs

17 issues (10 S, 6 M, 1 L).

Coverage (#318, #732, #733), the language servers (#320, #834, #858, #859), the command line (#340, #322, #747, #833, #860, #862), the playground bundle (#814), the documented deep imports (#789) and a count the pages state (#869).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#318](https://github.com/aontu-lang/aontu/issues/318) | tool | M |  | vet --coverage reports VACUOUS 0/4 when a schema reaches data through a disjunction of closed records. |
| [#732](https://github.com/aontu-lang/aontu/issues/732) | tool | M |  | `vet --coverage` reports VACUOUS when a template or member value is written as a meet. |
| [#733](https://github.com/aontu-lang/aontu/issues/733) | parity | M |  | Coverage report: Go spells declarations by internal name and double-counts taken ones; both list used names unused. |
| [#320](https://github.com/aontu-lang/aontu/issues/320) | tool | M |  | LSP publishes an included file's error against the open document, at the included file's row and column. |
| [#834](https://github.com/aontu-lang/aontu/issues/834) | parity | S |  | TypeScript LSP diagnostics carry the coloured CLI report. |
| [#340](https://github.com/aontu-lang/aontu/issues/340) | tool | L |  | Review all 30-odd verbs and about 89 long flags for need, single meaning, documentation and parity. |
| [#322](https://github.com/aontu-lang/aontu/issues/322) | tool | S |  | Three rough edges: `aontu why` gives no model-why hint; pinned default keeps its marker; NilVal lacks message. |
| [#747](https://github.com/aontu-lang/aontu/issues/747) | tool | S |  | fmt moves an own-line comment before a non-first &: entry onto the previous entry's line, both ports. |
| [#833](https://github.com/aontu-lang/aontu/issues/833) | bug | S |  | --canon prints an unknown function as nil and exits 0. |
| [#814](https://github.com/aontu-lang/aontu/issues/814) | tool | S |  | Playground bundle is stale and a rebuilt one fails the smoke check on `structuredClone`. |
| [#789](https://github.com/aontu-lang/aontu/issues/789) | docs | S |  | Documented deep imports `aontu/dist/val/*` and `aontu/dist/lsp` fail under ESM and nodenext. |
| [#858](https://github.com/aontu-lang/aontu/issues/858) | tool | S |  | Both language servers send one written conflict once for each path that copies it. |
| [#859](https://github.com/aontu-lang/aontu/issues/859) | tool | S |  | Hover on a recursive position reads `*recurse*` in TypeScript and `*value*` in Go. |
| [#860](https://github.com/aontu-lang/aontu/issues/860) | tool | M |  | `trim --check` examines nothing below a key stated twice, an explicit `&` or a call, and answers `clean`. |
| [#862](https://github.com/aontu-lang/aontu/issues/862) | design | M |  | No verb of either CLI, the REPL or the MCP tools can bind a host variable `$name`. HV1 of the lang refinement plan. |
| [#869](https://github.com/aontu-lang/aontu/issues/869) | docs | S |  | `llms.txt` and `docs/lsp.md` count 68 built-ins where `test/spec/signature.tsv` declares 72. |
| [#939](https://github.com/aontu-lang/aontu/issues/939) | bug | S |  | Coverage: `ts/src/cursor.ts` has 13 uncovered items on `main`, and `labelLength` in `ts/src/lsp.ts` one arm (ADR-002). |

## With the lang refinement plan: three language changes

3 issues (3 L).

Each asks for a change to the language, and each is a part of [the lang refinement plan](../sketch/LANG-REFINEMENT-PLAN.0.md), which holds its tasks and its rulings. Their order is fixed there: roots, then versions, then types.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#884](https://github.com/aontu-lang/aontu/issues/884) | design | L |  | `$` as the root of the source file it is written in, and `$$` as the global root. Part 8 of that plan, tasks RP1 to RP5. |
| [#881](https://github.com/aontu-lang/aontu/issues/881) | design | L |  | A language version stated in each source file, with older forms read through a table of translations. Part 9, tasks LV1 to LV5. |
| [#886](https://github.com/aontu-lang/aontu/issues/886) | design | L |  | More scalar types by the convention of `path()`: dates and times, `semver`, five identifiers and bytes. Part 10, tasks ST1 to ST7. |

## Alongside: the definition and the repository

These can run at any point. #826 and #828 are already in phase 1.

### The definition

5 issues (2 S, 2 M, 1 L), 2 ledger rows.

#403 and #432 are proof and reading gaps in `spec/`, and #829 lists the redundancy the first review pass left.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#826](https://github.com/aontu-lang/aontu/issues/826) | spec | S |  | `Val.beq` lacks same-constructor cases for map, list and hole kinds, so each reads unlike itself. |
| [#828](https://github.com/aontu-lang/aontu/issues/828) | spec | S |  | Oracle `readThroughCases` lists `relate([_])` against `"x"` twice, so dr27–dr29 repeat dr21–dr23. |
| [#829](https://github.com/aontu-lang/aontu/issues/829) | spec | L |  | Tracking list of remaining definition and proof redundancy left after the first review pass, #827. |
| [#403](https://github.com/aontu-lang/aontu/issues/403) | spec | M |  | Definition: a selection in a recursive body over an open scrutinee lacks a VetP theorem and rows. |
| [#432](https://github.com/aontu-lang/aontu/issues/432) | spec | M | 2 | Definition reads a waiting `+` inside a trial as refusing; both ports wait (incomplete). |

### Repository process

4 issues (3 S, 1 M).

Each is a small gate that stops a fault from coming back.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#836](https://github.com/aontu-lang/aontu/issues/836) | process | M |  | Shared rows owed for seven fixes closed on 2026-11-19, and two stale texts. |
| [#813](https://github.com/aontu-lang/aontu/issues/813) | tool | S |  | Go sources are not gofmt-clean and no Makefile target or workflow checks gofmt. |
| [#611](https://github.com/aontu-lang/aontu/issues/611) | process | S |  | Union merge of the prompt log drops shared closing fences, leaving entries unclosed; no automated guard. |
| [#443](https://github.com/aontu-lang/aontu/issues/443) | tool | S |  | Vale drops alerts around an HTML entity spelling a tag in a code fence. |

## The rulings of 2026-11-22

The project's owner ruled on 2026-11-21 and 2026-11-22, in
[the lang refinement plan](../sketch/LANG-REFINEMENT-PLAN.0.md#the-rulings-on-parts-8-to-11),
on the questions that the newer issues and some older ones above
waited on. That plan numbers its rulings apart from the definition's.
Those that are rules of the language are also decisions of section 7
of [`sketch/DEFINITION.0.md`](../sketch/DEFINITION.0.md), under the
number in the last column. A feature is entered there when it is
built, and a diagnostic has no decision, since the definition holds no
message and no site.

| issues | plan ruling | ruled | the definition's decision |
|---|---|---|---|
| [#870](https://github.com/aontu-lang/aontu/issues/870) | 38 | an unknown call is refused wherever it stands | 77 |
| [#847](https://github.com/aontu-lang/aontu/issues/847) | 39 | a trial reads the value a default generates | 78 |
| [#849](https://github.com/aontu-lang/aontu/issues/849) | 40 | `maybe(v, fallback)` | with the build |
| [#848](https://github.com/aontu-lang/aontu/issues/848) | 41 | `md`, `mdcell` and `mdcode` | with the build |
| [#892](https://github.com/aontu-lang/aontu/issues/892) | 42 | the whole argument admits nothing | 74 |
| [#895](https://github.com/aontu-lang/aontu/issues/895) | 43 | the path reads the field as the data settles it | 76 |
| [#472](https://github.com/aontu-lang/aontu/issues/472), [#475](https://github.com/aontu-lang/aontu/issues/475) and [#810](https://github.com/aontu-lang/aontu/issues/810) | 44 | a quoted segment, `$.a."x.y"` | 79 |
| [#349](https://github.com/aontu-lang/aontu/issues/349) | 45 | `*(` before a literal map or list is a preference | 80 |
| [#751](https://github.com/aontu-lang/aontu/issues/751) | 46 | a generator reads its own bag where no cycle is read, and a true cycle is refused and named | 81 |
| [#889](https://github.com/aontu-lang/aontu/issues/889) | 47 | a file that is not valid UTF-8 is refused, with one code | 82 |
| [#779](https://github.com/aontu-lang/aontu/issues/779) | 48 | a relation's template is held in one form wherever it is copied | 83 |
| [#517](https://github.com/aontu-lang/aontu/issues/517) | 49 | a set of names written without commas reads as the comma form | 84 |
| [#328](https://github.com/aontu-lang/aontu/issues/328), [#332](https://github.com/aontu-lang/aontu/issues/332), [#333](https://github.com/aontu-lang/aontu/issues/333), [#518](https://github.com/aontu-lang/aontu/issues/518) and [#786](https://github.com/aontu-lang/aontu/issues/786) | 50 | TypeScript's reading |  |
| [#313](https://github.com/aontu-lang/aontu/issues/313) | 50 | the headline says `resolve`, as Go's does |  |
| [#540](https://github.com/aontu-lang/aontu/issues/540) | 50 | the definition's reading | 18 |
| [#894](https://github.com/aontu-lang/aontu/issues/894) | 50 | `must` reads a written `nil` as ruling 54 does | 75 |
| [#331](https://github.com/aontu-lang/aontu/issues/331), [#845](https://github.com/aontu-lang/aontu/issues/845), [#887](https://github.com/aontu-lang/aontu/issues/887), [#876](https://github.com/aontu-lang/aontu/issues/876), [#841](https://github.com/aontu-lang/aontu/issues/841), [#734](https://github.com/aontu-lang/aontu/issues/734), [#755](https://github.com/aontu-lang/aontu/issues/755), [#658](https://github.com/aontu-lang/aontu/issues/658) and [#320](https://github.com/aontu-lang/aontu/issues/320) | 50 | a value from an included file is sited in its own file |  |
| [#842](https://github.com/aontu-lang/aontu/issues/842) | 36 | a file is whole where it lands | with the build |

[Part 11](../sketch/LANG-REFINEMENT-PLAN.0.md#part-11-the-open-issues) of that plan says where each
workstream above meets its tasks.

## Order at a glance

| phase | workstreams | issues | ledger rows |
|---|---|---|---|
| 0 | decisions | 7 questions, ruled 2026-11-19 | |
| 1 | quick wins | 18 | |
| 2 | alias cycles, preferences, seals and marks, copies | 54 | 22 |
| 3 | relations, path steps, generators, declarations, subsume, scalars, parser | 76 | 21 |
| 4 | diagnostics, tooling | 34 | |
| with the lang refinement plan | root paths, language versions, scalar types | 3 | |
| alongside | the definition, the repository | 9 | 2 |

The issue counts overlap where a quick win belongs to a workstream.
From phase 2 on, each count is the sum of its workstreams' own, as
they stand on 2026-11-22 with #907 added, and #936 to #939, #942 to
#944, #946 and #953 to #957 on 2026-11-24. The ledger rows are counted on 2026-11-24, from the issue
each row's cause names. The ledger's other 10 rows name decision 3 and
no issue: they're #343's.
