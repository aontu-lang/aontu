# Plan for the open issues

What to do about the 131 issues open on 2026-11-19, after the triage of
[`issue-triage.md`](issue-triage.md). Fourteen issues were closed that
day. #431, found only partly fixed, stays open. The triage filed three,
and #836 tracks the rows the closed fixes still owe. Each open issue is in one workstream below, and the
workstreams fall into five phases, ordered by what each one unblocks and
by how many rows of `spec/ledger.tsv` it clears.

## How each fix lands

- **A ruling comes before the code** wherever a fix waits on one
  (phase 0). Building to a guess is how a divergence gets baselined.
- **A fix lands with the shared row that pins it**, its expected value
  taken from both engines, and the definition's where it has one
  ([the parity probe](../docs/contributing/testing.md#the-parity-probe)).
  So does each issue closed on 2026-11-19 that still has no row.
- **A definition-side fix removes its ledger rows** in the same change,
  and lowers the ledger's bound in all three places it is held.
- **Progress is three numbers**: open issues (131), ledger rows (394
  at most), and entries in `test/spec/divergent.tsv`.

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

Four workstreams hold 354 of the ledger's rows. In order:

1. **The alias-cycle rule** first: one static check, five issues, and
   it removes the TypeScript crash of #360.
2. **Preferences and disjunction arms**: the largest, 178 rows, already
   ruled.
3. **Seals and marks**: led by #726's bare `close()` and `open()`, with
   57 rows, ruled by decisions 44 to 46. #748 and #749 here also
   unblock the relations workstream.
4. **Copies, bodies and templates**: #738 is ruled (rulings 59 to 61),
   and the work follows `sketch/CORE.0.md` §4.

### The alias-cycle rule

5 issues (4 M, 1 L), 33 ledger rows.

A name or a path that reaches itself consuming no key or element is a static `error` (decisions 1, 2 and 7). Both engines answer it as a cycle found while evaluating: `invalid`, a budget, or in TypeScript a stack overflow. One check, run before evaluation, clears the group.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#329](https://github.com/aontu-lang/aontu/issues/329) | parity | M |  | A reference cycle through nof trial schemas is invalid in TypeScript and a unify_cycle error in Go. |
| [#354](https://github.com/aontu-lang/aontu/issues/354) | def | M | 3 | `%U = %U` answers invalid by unify_cycle in both ports; the definition rules a self-declared name an error. |
| [#357](https://github.com/aontu-lang/aontu/issues/357) | def | L | 9 | Self-reading paths answer unify_cycle (invalid) not error, and a recursive position met in place cycles instead of expanding. |
| [#360](https://github.com/aontu-lang/aontu/issues/360) | parity | M |  | A trial schema reading only its own name overflows the TypeScript stack on a container; Go answers invalid. |
| [#361](https://github.com/aontu-lang/aontu/issues/361) | def | M | 21 | A name reached through its own trial with nothing between is decided by the budget, not an error. |

### Preferences and disjunction arms

10 issues (4 S, 4 M, 2 L), 178 ledger rows.

How both engines read a preference, a lone preference and a live disjunction arm, against rulings 41 and 42 and decision 43. #714 still generates the wrong value in four shapes no `gens` row holds, so its rows come first. #832 is the siting half of #482.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#700](https://github.com/aontu-lang/aontu/issues/700) | def | L | 90 | A path in a live disjunction arm or lone preference waits; both ports say incomplete, the definition valid. |
| [#702](https://github.com/aontu-lang/aontu/issues/702) | def | M | 18 | Lone preference with an outside path: both ports' vet contradicts their own eval; definition sides with eval. |
| [#704](https://github.com/aontu-lang/aontu/issues/704) | def | M | 45 | A lone preference's parent arm lifts a path inside it to any, not the parent type it reads. |
| [#714](https://github.com/aontu-lang/aontu/issues/714) | def | L | 22 | Meeting preferences of different ranks drops the higher rank's constraint and default; rulings 41, 42, decision 43. |
| [#482](https://github.com/aontu-lang/aontu/issues/482) | def | M | 3 | A made default clash (`pref(1 \| 2)`, meets) reads invalid under vet, where a written clash is error. |
| [#719](https://github.com/aontu-lang/aontu/issues/719) | diag | S |  | TypeScript leaks the internal trial-nil sentinel, unsited, where Go answers `pref_rank_clash`. |
| [#349](https://github.com/aontu-lang/aontu/issues/349) | bug | S |  | `*(` before a literal container reads as an implicit bag: an error alone, silently dropped in a disjunction. |
| [#348](https://github.com/aontu-lang/aontu/issues/348) | parity | M |  | Disjunction arms written differently but generating the same value: Go generates it, TypeScript answers disjunct_no_gen. |
| [#832](https://github.com/aontu-lang/aontu/issues/832) | parity | S |  | A made default's pref_rank_clash: Go sites $, TypeScript loses the position. |
| [#431](https://github.com/aontu-lang/aontu/issues/431) | bug | S |  | A concrete value lost to a default by declaration order (`**default`, value, `*default`). |

### Seals, marks, moves and generation-time checks

11 issues (1 S, 7 M, 3 L), 65 ledger rows.

A seal, a mark or a move, and the checks that wait for generation: #726 (bare `close()` and `open()`, decisions 44 to 46) carries 57 rows. #748 and #749 (a path into a container met with a deferred atom or a seal) also block the relations workstream.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#726](https://github.com/aontu-lang/aontu/issues/726) | def | L | 57 | Bare `close()`/`open()` act on their own conjunct, not on the place's met terms (decisions 44–46). |
| [#749](https://github.com/aontu-lang/aontu/issues/749) | bug | M |  | close() or open() wrapping a map whose member reads a sibling never resolves: mapval_no_gen. |
| [#748](https://github.com/aontu-lang/aontu/issues/748) | bug | L |  | Paths into a container met with len, unique, when, must, nof, contains or rest resolve to nothing. |
| [#817](https://github.com/aontu-lang/aontu/issues/817) | def | M |  | Generation-time checks (len, contains, when) never run under `hide()` or `type()`; definition reads invalid. |
| [#540](https://github.com/aontu-lang/aontu/issues/540) | def | S |  | A hide(nil) list element keeps its position in both engines; the definition drops it |
| [#633](https://github.com/aontu-lang/aontu/issues/633) | def | M |  | A mark on a generator's source reaches every instance in both engines; definition reads through it. |
| [#668](https://github.com/aontu-lang/aontu/issues/668) | bug | M |  | `move` of a list element drops it from output, but vet keeps its position; output fails vet. |
| [#346](https://github.com/aontu-lang/aontu/issues/346) | def | M | 8 | `close([1, 2])` met with `[&: integer]` loses its fixed length and admits `[1, 2, 3]` in both ports. |
| [#343](https://github.com/aontu-lang/aontu/issues/343) | def | M |  | `string & (string & empty())` admits the empty string in both ports; the definition refuses it. |
| [#770](https://github.com/aontu-lang/aontu/issues/770) | parity | L |  | type() block filled by statements answers unlike the whole block, ports split five ways; case 1 ruled (67). |
| [#486](https://github.com/aontu-lang/aontu/issues/486) | parity | M |  | move with a meta/hide rider: TS and Go split on vet data overriding the copy |

### Where copies, bodies and templates read paths and key()

16 issues (1 S, 13 M, 2 L), 78 ledger rows.

Where a copy, a declaration's body or a template reads its relative paths and `key()`: the two notions of where that `sketch/CORE.0.md` §4 plans to make one. #504 alone has 54 rows. #738 is ruled: a declaration has no place, and its body is read at each use (ruling 59).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#463](https://github.com/aontu-lang/aontu/issues/463) | def | L |  | `key()` copied through a reference shallower than its target reads a stale target segment. |
| [#465](https://github.com/aontu-lang/aontu/issues/465) | def | M |  | `key()` under a preference never resolves; TS silently drops the field, Go answers `no_gen`. |
| [#500](https://github.com/aontu-lang/aontu/issues/500) | def | M |  | Relative path in a spread template names nothing at members a link or copy makes |
| [#501](https://github.com/aontu-lang/aontu/issues/501) | parity | M |  | Alias body's relative spread used at the top: TS no_path, Go valid |
| [#504](https://github.com/aontu-lang/aontu/issues/504) | def | L | 54 | Relative path in alias body or path-reference copy reads by source order; ruling 26 says at copy |
| [#520](https://github.com/aontu-lang/aontu/issues/520) | def | M |  | Path into generator output or landing above its target rereads key() wrongly, both engines |
| [#528](https://github.com/aontu-lang/aontu/issues/528) | def | M | 6 | key(n) in a declaration body reads the internal name %T@file, so fitting bodies error |
| [#539](https://github.com/aontu-lang/aontu/issues/539) | def | M | 6 | key() after an absent list element reads the written index, not the element's position |
| [#330](https://github.com/aontu-lang/aontu/issues/330) | diag | M |  | A key missing under a reference to a deeper target is reported at a nonexistent path. |
| [#692](https://github.com/aontu-lang/aontu/issues/692) | parity | M | 6 | A name bound to a multi-step path, written first, misreads the target's relative paths; TS and Go differ. |
| [#698](https://github.com/aontu-lang/aontu/issues/698) | parity | S |  | TypeScript places a relative path in a `match` result under a NaN step; Go matches the definition. |
| [#696](https://github.com/aontu-lang/aontu/issues/696) | parity | M | 3 | Go's vet reads a template copied by a path reference twice, conflicting; TypeScript reads it once. |
| [#765](https://github.com/aontu-lang/aontu/issues/765) | def | M |  | eval reads deeper recursion levels' relative paths at the body's place; vet and definition read them per level. |
| [#762](https://github.com/aontu-lang/aontu/issues/762) | def | M | 1 | Recursive name used alone whose body links to its own member: engines expand it (valid), definition says incomplete. |
| [#691](https://github.com/aontu-lang/aontu/issues/691) | def | M |  | A map spread's template cannot read a sibling it supplies at a member written in the same map. |
| [#416](https://github.com/aontu-lang/aontu/issues/416) | def | M | 2 | A path inside a rider's value to a sibling member leaves both ports incomplete (`mapval_no_gen`). |

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

12 issues (2 S, 10 M), 36 ledger rows.

Generators that cannot read the member they make (#754) or their own enclosing bag (#751), `key(n)` in an `emit` template (#783, #786), the trial question of #818, ruled as 63, and three findings of decision 62's build, ruled 2026-11-22: #892, a conflict below the top of a trial argument read against a value, which makes the whole argument admit nothing (74, the definition moves), #894, a written `nil` below the top of `must`'s condition, which reads as ruling 54 reads it (75, both ports move), and #895, a path in `must`'s condition into the value under trial, which reads the field as 63 reads one in `match` (76, both ports and the definition move).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#751](https://github.com/aontu-lang/aontu/issues/751) | bug | M |  | Generator over its own enclosing bag refused as not a bag (filter_data etc.); misdiagnosed, often acyclic. |
| [#754](https://github.com/aontu-lang/aontu/issues/754) | bug | M |  | Filter condition in a member pack, each or apply makes cannot read the member: answers empty, no error. |
| [#783](https://github.com/aontu-lang/aontu/issues/783) | parity | M |  | Bare `key(n)` in a named emit table's body reads the body index in TypeScript at top level. |
| [#786](https://github.com/aontu-lang/aontu/issues/786) | parity | M |  | `key(n)` in an emit template's `replace` value climbs one level less in Go than TypeScript. |
| [#466](https://github.com/aontu-lang/aontu/issues/466) | parity | S |  | TS `pack` keeps only the first colliding instance, losing riders; Go unifies them. |
| [#812](https://github.com/aontu-lang/aontu/issues/812) | parity | M |  | `must()` reading siblings in a spread template is `no_path` in TypeScript; Go and definition read per member. |
| [#818](https://github.com/aontu-lang/aontu/issues/818) | def | M |  | `match()` met with the map whose field it reads never settles: incomplete in ports, error in definition. |
| [#743](https://github.com/aontu-lang/aontu/issues/743) | def | M | 12 | A `match` over an open scrutinee is refused before data; ruling 49 says wait for the data. |
| [#527](https://github.com/aontu-lang/aontu/issues/527) | def | S |  | neq over a nested list written in place expands it twice; path form expands once |
| [#892](https://github.com/aontu-lang/aontu/issues/892) | def | M | 3 | A conflict below the top of a trial argument read against a value: both ports make the argument admit nothing, the definition reads it in place. Ruled as 74: the whole argument admits nothing, so the definition moves. |
| [#894](https://github.com/aontu-lang/aontu/issues/894) | def | M | 12 | A written `nil` below the top of `must`'s condition refuses every value in both ports (`invalid-arg`), where ruling 54 reads it where it stands. Ruled as 75: `must` reads it as ruling 54 does, so both ports drop the builder's check. |
| [#895](https://github.com/aontu-lang/aontu/issues/895) | def | M | 9 | A path in `must`'s condition into the value under trial: both ports leave it unread and pass the check, the definition reads `error` or `invalid`. Ruled as 76: the path reads the field, as 63 reads one in `match`, so both ports and the definition move. |

### Declarations, loads, includes and built-in models

12 issues (3 S, 8 M, 1 L).

Faults at an include or a built-in model's boundary, which lose structure or a site, and the declaration questions #738 rules on.

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

### subsume and breaking

5 issues (2 S, 3 M), 1 ledger rows.

The `subsume` and `breaking` gaps besides relations: a range inside a template (#321), recursive lists (#387), defaults at a list position (#424), and the missing finding for a document that does not stand up (#774, with #755).

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#321](https://github.com/aontu-lang/aontu/issues/321) | bug | M |  | breaking and subsume answer undecided for any range change inside a spread template; outside one they decide. |
| [#387](https://github.com/aontu-lang/aontu/issues/387) | def | M |  | subsume says a recursive list subsumes `[integer, any]`, though `[1, 5]` is a witness against it. |
| [#424](https://github.com/aontu-lang/aontu/issues/424) | def | S | 1 | `subsume` under defaults ignores a default at a list position in both ports. |
| [#774](https://github.com/aontu-lang/aontu/issues/774) | diag | S |  | subsume and breaking answer verdict error, exit 4, with no finding naming the failing document or cause. |
| [#735](https://github.com/aontu-lang/aontu/issues/735) | diag | M |  | `subsume`/`breaking` lose a meet member's site: TypeScript writes -1:-1, Go 1:1. |

### Scalars and generated output

7 issues (5 S, 2 M).

Small parity faults in builtins, and #825's `form`, which is cheapest before the next release.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#439](https://github.com/aontu-lang/aontu/issues/439) | parity | S |  | TS refuses a biginteger `upper`/`lower` index from 2^53; Go accepts up to int64. |
| [#447](https://github.com/aontu-lang/aontu/issues/447) | parity | S |  | `split` of the empty string at a non-empty pattern: TS gives `[]`, Go `[""]`. |
| [#451](https://github.com/aontu-lang/aontu/issues/451) | parity | S |  | `nom` with style `""`: Go answers all spellings, TS refuses `invalid-arg`, as the reference reads. |
| [#756](https://github.com/aontu-lang/aontu/issues/756) | parity | S |  | join over a list holding a path value: TypeScript joins its spelling, Go leaves it unresolved (mapval_no_gen). |
| [#825](https://github.com/aontu-lang/aontu/issues/825) | design | M |  | Ruled: rename gen notation options `as`, `case`, `keys` to `form` across model, ports, rows, docs. |
| [#395](https://github.com/aontu-lang/aontu/issues/395) | bug | S |  | Canon drops the meta() record from a spread template that comes from an alias, in both ports. |
| [#319](https://github.com/aontu-lang/aontu/issues/319) | bug | M |  | allOf members typing one property differently import as nil, refusing every object instead of forbidding the key. |

### Parser limits

2 issues (2 M).

The pinned `@tabnas/expr` overflows. Retest against the published 0.6.3 before changing the pin, which `docs/contributing/parity.md` keeps exact on purpose.

| # | kind | effort | ledger rows | what it is |
|---|---|---|---|---|
| [#325](https://github.com/aontu-lang/aontu/issues/325) | parity | M |  | A flat operator chain of about 1,950 members overflows the TypeScript parser stack; Go parses it. |
| [#326](https://github.com/aontu-lang/aontu/issues/326) | parity | M |  | `neq(-1, -2, -3)` overflows the TypeScript parser stack, where Go evaluates it; upstream @tabnas/expr defect. |

## Phase 4: diagnostics and tooling

### Diagnostics: sites, messages and frames

13 issues (7 S, 6 M).

Thirteen issues where the verdict agrees and a code, site, frame or message does not. Rulings 64 and 65 settle #457 and #327, a refusal drawing a call as written and a value sited at its own span, and with them #331, #391 and #685. Each needs a row in the full-message twin tests.

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

### Tooling: coverage, LSP, CLI, playground, docs

11 issues (6 S, 4 M, 1 L).

Coverage (#318, #732, #733), the language servers (#320, #834), the command line (#340, #322, #747, #833), the playground bundle (#814) and the documented deep imports (#789).

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

## The issues filed since, and the rulings of 2026-11-22

28 issues were filed after 2026-11-19 and have no row above.
[Part 11](../sketch/LANG-REFINEMENT-PLAN.0.md#part-11-the-open-issues)
of the lang refinement plan places each in a workstream of this plan,
and says where each workstream above meets that plan's tasks. Three of
the 28 are parts of it: [#884](https://github.com/aontu-lang/aontu/issues/884) is its part 8, [#881](https://github.com/aontu-lang/aontu/issues/881) its part 9 and
[#886](https://github.com/aontu-lang/aontu/issues/886) its part 10.

The project's owner ruled there on 2026-11-22 on the questions these
issues, and some older ones above, waited on. The rulings are numbered
in that plan,
[38 to 50](../sketch/LANG-REFINEMENT-PLAN.0.md#the-rulings-on-parts-8-to-11),
apart from the definition's. Its rulings 42 and 43 are the definition's
74 and 76. The rest enter section 7 of the definition when their
workstream takes them up:

| issues | ruled |
|---|---|
| [#870](https://github.com/aontu-lang/aontu/issues/870) | 38: an unknown call is refused wherever it stands |
| [#847](https://github.com/aontu-lang/aontu/issues/847) | 39: a trial reads the value a default generates |
| [#849](https://github.com/aontu-lang/aontu/issues/849) | 40: `maybe(v, fallback)` |
| [#848](https://github.com/aontu-lang/aontu/issues/848) | 41: `md`, `mdcell` and `mdcode` |
| [#472](https://github.com/aontu-lang/aontu/issues/472), [#475](https://github.com/aontu-lang/aontu/issues/475) and [#810](https://github.com/aontu-lang/aontu/issues/810) | 44: a quoted segment, `$.a."x.y"` |
| [#349](https://github.com/aontu-lang/aontu/issues/349) | 45: `*(` before a literal map or list is a preference |
| [#751](https://github.com/aontu-lang/aontu/issues/751) | 46: a generator reads its own bag where no cycle is read, and a true cycle is refused and named |
| [#889](https://github.com/aontu-lang/aontu/issues/889) | 47: a file that is not valid UTF-8 is refused, with one code |
| [#779](https://github.com/aontu-lang/aontu/issues/779) | 48: a relation's template is held in one form wherever it is copied |
| [#517](https://github.com/aontu-lang/aontu/issues/517) | 49: a set of names written without commas reads as the comma form |
| [#328](https://github.com/aontu-lang/aontu/issues/328), [#332](https://github.com/aontu-lang/aontu/issues/332), [#333](https://github.com/aontu-lang/aontu/issues/333), [#518](https://github.com/aontu-lang/aontu/issues/518) and [#786](https://github.com/aontu-lang/aontu/issues/786) | 50: TypeScript's reading |
| [#313](https://github.com/aontu-lang/aontu/issues/313) | 50: the headline says `resolve`, as Go's does |
| [#540](https://github.com/aontu-lang/aontu/issues/540) | 50: the definition's reading, its decision 18 |
| [#331](https://github.com/aontu-lang/aontu/issues/331), [#845](https://github.com/aontu-lang/aontu/issues/845), [#887](https://github.com/aontu-lang/aontu/issues/887), [#876](https://github.com/aontu-lang/aontu/issues/876), [#841](https://github.com/aontu-lang/aontu/issues/841), [#734](https://github.com/aontu-lang/aontu/issues/734), [#755](https://github.com/aontu-lang/aontu/issues/755), [#658](https://github.com/aontu-lang/aontu/issues/658) and [#320](https://github.com/aontu-lang/aontu/issues/320) | 50: a value from an included file is sited in its own file |
| [#842](https://github.com/aontu-lang/aontu/issues/842) | 36: a file is whole where it lands |

The parser issues were tried with the pins raised, `@tabnas/expr` at
0.6.4: [#325](https://github.com/aontu-lang/aontu/issues/325) closes, and [#326](https://github.com/aontu-lang/aontu/issues/326) gets worse, the TypeScript engine
running out of memory where it overflowed its stack at once.
[The table](../sketch/LANG-REFINEMENT-PLAN.0.md#what-the-pins-do-to-the-parser-issues)
is in that plan, and a fix for [#326](https://github.com/aontu-lang/aontu/issues/326) comes before the pins rise.

## Order at a glance

| phase | workstreams | issues | ledger rows |
|---|---|---|---|
| 0 | decisions | 7 questions, ruled 2026-11-19 | |
| 1 | quick wins | 18 | |
| 2 | alias cycles, preferences, seals and marks, copies | 42 | 354 |
| 3 | relations, path steps, generators, declarations, subsume, scalars, parser | 57 | 34 |
| 4 | diagnostics, tooling | 24 | |
| alongside | the definition, the repository | 9 | 2 |

The issue counts overlap where a quick win belongs to a workstream.
