# Open issues, triaged

The 141 issues open on aontu-lang/aontu on 2026-11-18, each read in full
and placed by what kind of fault it is, the part of the language it
touches, whether it still holds, and a rough size. Status was checked
against the commits that mention the issue, against the ledger
(`spec/ledger.tsv`), and by running the issue's own reproduction in both
CLIs (0.76.0, `main` at f91636c1) wherever it gave one. The snapshot goes
stale as issues move: the issues are the record, and this page is a map
of them on one day.

## How to read it

**Kind**, what is wrong:

| kind | meaning |
|---|---|
| parity | TypeScript and Go answer differently |
| def | both engines agree, and the definition (`spec/`) says otherwise |
| bug | both engines wrong by the language's own rules, with no definition claim |
| diag | the verdict is right; a code, site, frame, path or message differs or is wrong |
| spec | the definition itself has the gap or the defect |
| tool | the CLI, the language server, `fmt`, coverage, the playground or the build |
| docs | documentation |
| design | a proposal or an open question of the language |
| process | how the repository is run |

**Status**: *open* still reproduces or is still ledgered; *likely-fixed*
no longer reproduces, with the evidence below; *duplicate*; and
*needs-ruling*, which waits on a decision rather than on code.
**Effort** is S, M or L: a change in one place, a change in both
engines, or a change to how the engines or the definition read a whole
class of documents.

## At a glance

| kind | issues | | area | issues |
|---|---|---|---|---|
| def | 42 | | relations | 22 |
| parity | 31 | | paths | 15 |
| diag | 27 | | trials | 11 |
| bug | 18 | | scalars, decls | 10 each |
| tool | 9 | | generators, prefs | 9 each |
| spec, design | 6 each | | cli, parser, modules | 8 each |
| process, docs | 1 each | | marks | 7 |
| | | | subsume, keyn | 6 each |
| | | | process | 4 |
| | | | jsonschema, output | 3 each |
| | | | lsp, web | 1 each |

123 are open, 13 look fixed, 4 wait on a ruling and 1 is a duplicate.
By size: 50 S, 74 M, 17 L.

Two things stand out. Almost a third of the issues (42) are places where
both engines agree with each other and not with the definition, and
four of them (#700, #702, #704, #714) hold 175 of the ledger's rows. And
the largest single area is relations (22), where the renaming of `rel()`
and `refer()` to `relate()` (#791) has fixed several issues and changed
how the rest reproduce.

## Close, merge or narrow

These no longer reproduce, or are another issue's question:

| # | evidence | to do |
|---|---|---|
| [#366](https://github.com/aontu-lang/aontu/issues/366) | decision 9 ruled for the ports and built as `meetClash` | close |
| [#368](https://github.com/aontu-lang/aontu/issues/368) | both ports now drop a `nil` cover | close after the `vet` row it asks for |
| [#381](https://github.com/aontu-lang/aontu/issues/381) | decisions 13 to 15 built; `spec/forms-outside.tsv` is empty | close |
| [#431](https://github.com/aontu-lang/aontu/issues/431) | fixed by #713; the reproduction now agrees in both | close at the next release from `main` |
| [#468](https://github.com/aontu-lang/aontu/issues/468) | all ten shapes answer as the definition does, in both | close once its rows land |
| [#488](https://github.com/aontu-lang/aontu/issues/488) | eval and vet agree in either order since #791 | close |
| [#489](https://github.com/aontu-lang/aontu/issues/489) | both hints write `path()`; `refer()` is gone | close |
| [#492](https://github.com/aontu-lang/aontu/issues/492) | all four documents agree, read from the `relate` field | close |
| [#493](https://github.com/aontu-lang/aontu/issues/493) | eval and vet agree on all four rows | close |
| [#536](https://github.com/aontu-lang/aontu/issues/536) | both orders now conflict at `a.n` | close |
| [#594](https://github.com/aontu-lang/aontu/issues/594) | a measurement error; its rows (rl84 on) pass in both | close |
| [#605](https://github.com/aontu-lang/aontu/issues/605) | both ports site the member, as `super.tsv` pins | close after an eval-mode row |
| [#781](https://github.com/aontu-lang/aontu/issues/781) | both generate every variant since graph atoms ride the value | close once a shared row lands |
| [#830](https://github.com/aontu-lang/aontu/issues/830) | the question #465 answers: `*key()` and `pref(key())` agree once `key()` reads where it stands | fold into #465 |
| [#776](https://github.com/aontu-lang/aontu/issues/776) | the ruled range check of #777 reports at the link | fold into #777, or keep as its acceptance case |

These still hold but say more than is still true:

- [#479](https://github.com/aontu-lang/aontu/issues/479) `maybe()`: items 4 and 6, the `abnf` difference and the `each` case now agree; narrow it to items 1, 2, 3, 5 and 7.
- [#482](https://github.com/aontu-lang/aontu/issues/482): the comment's `(*1 | 2) & *integer` is valid since ruling 41; rows rk60 to rk62 replaced rk30 to rk32.
- [#752](https://github.com/aontu-lang/aontu/issues/752): since #791 only the `..b` and `...b` rows differ (TypeScript refuses, Go links); retitle it to those.
- [#661](https://github.com/aontu-lang/aontu/issues/661) and [#714](https://github.com/aontu-lang/aontu/issues/714): partly fixed (ll6 to ll8; rk18 to rk23, rk30 to rk32, rk42 to rk44), and their bodies predate it.
- [#330](https://github.com/aontu-lang/aontu/issues/330) has flipped: TypeScript now names `$.quote.a` and Go the stale `$.quote.M.a`, so `test/spec/divergent.tsv` names the wrong side.
- [#328](https://github.com/aontu-lang/aontu/issues/328) has grown: the rendered value now differs as well as the site.
- Reproductions that use `rel()` or `refer()` (#658, #661, #746, #748, #752, #771, #773, #776 to #778) no longer run as written; `relate()` replaces both.

## Waiting on a decision

These need a ruling before anyone can write code:

- [#457](https://github.com/aontu-lang/aontu/issues/457): does a call's refusal show an argument as written or as driven?
- [#535](https://github.com/aontu-lang/aontu/issues/535): the `nil` questions are settled (#796); a conflict below an eager argument's top is an `error` in the ports and `invalid` in the definition.
- [#738](https://github.com/aontu-lang/aontu/issues/738): a declaration with no place, its body read at each use; five open decisions. Ruling it first shapes #692, #733 and #746.
- [#818](https://github.com/aontu-lang/aontu/issues/818): a `match()` met with the map whose field it reads.
- [#819](https://github.com/aontu-lang/aontu/issues/819): a subsumption rule for a relation's members, without which `breaking` stays undecided.
- [#770](https://github.com/aontu-lang/aontu/issues/770) case 1 and [#733](https://github.com/aontu-lang/aontu/issues/733) in part.

These are ruled and wait only on the engines: [#474](https://github.com/aontu-lang/aontu/issues/474)
(decision 23), [#714](https://github.com/aontu-lang/aontu/issues/714) (rulings 41 and 42,
decision 43), [#743](https://github.com/aontu-lang/aontu/issues/743) (ruling 49),
[#777](https://github.com/aontu-lang/aontu/issues/777) (ruled 2026-11-17, a relation's range
checks its target) and [#825](https://github.com/aontu-lang/aontu/issues/825) (`form` for every
type's notation option, cheapest before the next release).

## Clusters that share a root cause

Fixing the cause closes the group:

1. **Preferences and disjunction arms**: #700, #702, #704, #714, with #482 and the verdict half of #719. 175 ledger rows; one rework of how both engines read a preference and a live arm.
2. **Where a copy, a body or a template reads its relative paths and `key()`** (`sketch/CORE.0.md` §4): #463, #465, #500, #501, #504, #520, #528, #539, and in part #330, #692 and #698. #504 alone holds 54 ledger rows.
3. **The alias-cycle rule** (decisions 1, 2 and 7: a name or path that reaches itself consuming no key): #329, #354, #357, #360, #361. A static `error` in both engines clears their rows and the #360 crash.
4. **A relation whose range names a subtype of its own type**: #771, #778, #779, #780, close to #770 case 4. The ruled check of #777 (and #776 with it) needs #748 first.
5. **A path into a container met with a deferred atom or a seal**: #748, #749.
6. **Path steps carried as text**: #471, #472, #475; a structural step closes all three.
7. **The hidden place of a declaration** (`$.%T`) shows through in #692, #733 and #746; #738 would remove it.
8. **Include and built-in model boundaries**: #514, #658, #730, #731, #734, #804, with #517.
9. **`vet` and evaluation disagree**: #491, #668, #765, #805, and #504's `add(..x, 1)` case.
10. **No finding for a document that does not stand up**: #755, #774.
11. **The pinned parser libraries** (`@tabnas/expr` at 0.5.10, 0.6.3 published): #324, #325, #326; retest against the newer release first.
12. **Site rules no shared row pins**: #327, #331, #333, #391, #685; one ruling on the site of a value would settle them.

## Quick wins

Small fixes in one engine, each with a reproduction that can become a
shared row: [#439](https://github.com/aontu-lang/aontu/issues/439) (TS),
[#447](https://github.com/aontu-lang/aontu/issues/447) (TS),
[#451](https://github.com/aontu-lang/aontu/issues/451) (Go),
[#466](https://github.com/aontu-lang/aontu/issues/466) (TS),
[#471](https://github.com/aontu-lang/aontu/issues/471) (TS),
[#502](https://github.com/aontu-lang/aontu/issues/502) (TS crash),
[#514](https://github.com/aontu-lang/aontu/issues/514) (Go),
[#698](https://github.com/aontu-lang/aontu/issues/698) (TS),
[#752](https://github.com/aontu-lang/aontu/issues/752) (TS). In the repository's process:
[#813](https://github.com/aontu-lang/aontu/issues/813) (a `gofmt` check),
[#611](https://github.com/aontu-lang/aontu/issues/611) (a test that each prompt-log entry closes its fence) and
[#443](https://github.com/aontu-lang/aontu/issues/443).

## Filed during this review

Three faults the review turned up, after the snapshot above:

- [#832](https://github.com/aontu-lang/aontu/issues/832), parity, prefs: a made default's `pref_rank_clash` is sited at `$` in Go and at no source position in TypeScript.
- [#833](https://github.com/aontu-lang/aontu/issues/833), bug, cli: `--canon` prints a call to an unknown function as `nil` and succeeds, which hides a document still written with `rel()` or `refer()`.
- [#834](https://github.com/aontu-lang/aontu/issues/834), parity, lsp: the TypeScript language server's diagnostic message is the CLI's coloured report, ANSI escapes and all.

## Every issue, by kind

### The two engines disagree (31)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#733](https://github.com/aontu-lang/aontu/issues/733) | cli | open | M | Coverage report: Go spells declarations by internal name and double-counts taken ones; both list used names unused. |
| [#692](https://github.com/aontu-lang/aontu/issues/692) | decls | open | M | A name bound to a multi-step path, written first, misreads the target's relative paths; TS and Go differ. |
| [#466](https://github.com/aontu-lang/aontu/issues/466) | generators | open | S | TS `pack` keeps only the first colliding instance, losing riders; Go unifies them. |
| [#783](https://github.com/aontu-lang/aontu/issues/783) | generators | open | M | Bare `key(n)` in a named emit table's body reads the body index in TypeScript at top level. |
| [#786](https://github.com/aontu-lang/aontu/issues/786) | generators | open | M | `key(n)` in an emit template's `replace` value climbs one level less in Go than TypeScript. |
| [#468](https://github.com/aontu-lang/aontu/issues/468) | keyn | likely-fixed | S | A path to a call reading `key()` changed the target's own value (Go scalar, list args). |
| [#770](https://github.com/aontu-lang/aontu/issues/770) | marks | open | L | type() block filled by statements answers unlike the whole block, ports split five ways; case 1 needs ruling. |
| [#502](https://github.com/aontu-lang/aontu/issues/502) | modules | open | M | @ before a non-string operand crashes TS, Go names no source; binding of @ needs ruling |
| [#514](https://github.com/aontu-lang/aontu/issues/514) | modules | open | M | Go leaks a document alias into output or meets it with a root-loaded file's alias |
| [#730](https://github.com/aontu-lang/aontu/issues/730) | modules | open | M | Including a file that holds a destructure head makes the whole document nil in Go; TypeScript reads it. |
| [#804](https://github.com/aontu-lang/aontu/issues/804) | modules | open | M | Go evaluates a document including a source that writes a destructure as nil, `parse_unknown` at `$`. |
| [#348](https://github.com/aontu-lang/aontu/issues/348) | output | open | M | Disjunction arms written differently but generating the same value: Go generates it, TypeScript answers disjunct_no_gen. |
| [#325](https://github.com/aontu-lang/aontu/issues/325) | parser | open | M | A flat operator chain of about 1,950 members overflows the TypeScript parser stack; Go parses it. |
| [#326](https://github.com/aontu-lang/aontu/issues/326) | parser | open | M | `neq(-1, -2, -3)` overflows the TypeScript parser stack, where Go evaluates it; upstream @tabnas/expr defect. |
| [#471](https://github.com/aontu-lang/aontu/issues/471) | paths | open | S | TS reads a path step unchecked: null binding names `"null"`, list step yields array properties. |
| [#501](https://github.com/aontu-lang/aontu/issues/501) | paths | open | M | Alias body's relative spread used at the top: TS no_path, Go valid |
| [#696](https://github.com/aontu-lang/aontu/issues/696) | paths | open | M | Go's vet reads a template copied by a path reference twice, conflicting; TypeScript reads it once. |
| [#698](https://github.com/aontu-lang/aontu/issues/698) | paths | open | S | TypeScript places a relative path in a `match` result under a NaN step; Go matches the definition. |
| [#486](https://github.com/aontu-lang/aontu/issues/486) | prefs | open | M | move with a meta/hide rider: TS and Go split on vet data overriding the copy |
| [#492](https://github.com/aontu-lang/aontu/issues/492) | relations | likely-fixed | S | Relative address in a nested relate container resolved from different bases in TS and Go |
| [#752](https://github.com/aontu-lang/aontu/issues/752) | relations | open | S | Member's relative address under an in-place template link: TypeScript refuses ..b and ...b, Go links correctly. |
| [#780](https://github.com/aontu-lang/aontu/issues/780) | relations | open | L | Table of two subtypes with subtype-ranged relation: TypeScript refuses valid data as empty; Go never terminates. |
| [#781](https://github.com/aontu-lang/aontu/issues/781) | relations | likely-fixed | S | Go met a pattern with the `relate()` call beside `acyclic()`, refusing at the hidden declaration. |
| [#439](https://github.com/aontu-lang/aontu/issues/439) | scalars | open | S | TS refuses a biginteger `upper`/`lower` index from 2^53; Go accepts up to int64. |
| [#447](https://github.com/aontu-lang/aontu/issues/447) | scalars | open | S | `split` of the empty string at a non-empty pattern: TS gives `[]`, Go `[""]`. |
| [#451](https://github.com/aontu-lang/aontu/issues/451) | scalars | open | S | `nom` with style `""`: Go answers all spellings, TS refuses `invalid-arg`, as the reference reads. |
| [#756](https://github.com/aontu-lang/aontu/issues/756) | scalars | open | S | join over a list holding a path value: TypeScript joins its spelling, Go leaves it unresolved (mapval_no_gen). |
| [#329](https://github.com/aontu-lang/aontu/issues/329) | trials | open | M | A reference cycle through nof trial schemas is invalid in TypeScript and a unify_cycle error in Go. |
| [#360](https://github.com/aontu-lang/aontu/issues/360) | trials | open | M | A trial schema reading only its own name overflows the TypeScript stack on a container; Go answers invalid. |
| [#368](https://github.com/aontu-lang/aontu/issues/368) | trials | likely-fixed | S | TypeScript refused a nil rest() cover as literal_nil where Go, the canon and ADR-058 drop it. |
| [#812](https://github.com/aontu-lang/aontu/issues/812) | trials | open | M | `must()` reading siblings in a spread template is `no_path` in TypeScript; Go and definition read per member. |

### Both engines against the definition (42)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#354](https://github.com/aontu-lang/aontu/issues/354) | decls | open | M | `%U = %U` answers invalid by unify_cycle in both ports; the definition rules a self-declared name an error. |
| [#762](https://github.com/aontu-lang/aontu/issues/762) | decls | open | M | Recursive name used alone whose body links to its own member: engines expand it (valid), definition says incomplete. |
| [#765](https://github.com/aontu-lang/aontu/issues/765) | decls | open | M | eval reads deeper recursion levels' relative paths at the body's place; vet and definition read them per level. |
| [#778](https://github.com/aontu-lang/aontu/issues/778) | decls | open | L | Two path definitions, one a meet over the other, generate, stay unresolved or cycle by writing order. |
| [#346](https://github.com/aontu-lang/aontu/issues/346) | generators | open | M | `close([1, 2])` met with `[&: integer]` loses its fixed length and admits `[1, 2, 3]` in both ports. |
| [#633](https://github.com/aontu-lang/aontu/issues/633) | generators | open | M | A mark on a generator's source reaches every instance in both engines; definition reads through it. |
| [#743](https://github.com/aontu-lang/aontu/issues/743) | generators | open | M | A `match` over an open scrutinee is refused before data; ruling 49 says wait for the data. |
| [#463](https://github.com/aontu-lang/aontu/issues/463) | keyn | open | L | `key()` copied through a reference shallower than its target reads a stale target segment. |
| [#465](https://github.com/aontu-lang/aontu/issues/465) | keyn | open | M | `key()` under a preference never resolves; TS silently drops the field, Go answers `no_gen`. |
| [#520](https://github.com/aontu-lang/aontu/issues/520) | keyn | open | M | Path into generator output or landing above its target rereads key() wrongly, both engines |
| [#528](https://github.com/aontu-lang/aontu/issues/528) | keyn | open | M | key(n) in a declaration body reads the internal name %T@file, so fitting bodies error |
| [#539](https://github.com/aontu-lang/aontu/issues/539) | keyn | open | M | key() after an absent list element reads the written index, not the element's position |
| [#540](https://github.com/aontu-lang/aontu/issues/540) | marks | open | S | A hide(nil) list element keeps its position in both engines; the definition drops it |
| [#726](https://github.com/aontu-lang/aontu/issues/726) | marks | open | L | Bare `close()`/`open()` act on their own conjunct, not on the place's met terms (decisions 44–46). |
| [#817](https://github.com/aontu-lang/aontu/issues/817) | marks | open | M | Generation-time checks (len, contains, when) never run under `hide()` or `type()`; definition reads invalid. |
| [#357](https://github.com/aontu-lang/aontu/issues/357) | paths | open | L | Self-reading paths answer unify_cycle (invalid) not error, and a recursive position met in place cycles instead of expanding. |
| [#416](https://github.com/aontu-lang/aontu/issues/416) | paths | open | M | A path inside a rider's value to a sibling member leaves both ports incomplete (`mapval_no_gen`). |
| [#472](https://github.com/aontu-lang/aontu/issues/472) | paths | open | M | A quoted path step `"."` reads as a parent climb in both ports, not key `"."`. |
| [#474](https://github.com/aontu-lang/aontu/issues/474) | paths | open | M | A path value met with a string constraint answers by meet order; ruled, ports must move. |
| [#479](https://github.com/aontu-lang/aontu/issues/479) | paths | open | L | `maybe()`: both ports read absence unlike the definition in several shapes (conflicts, missing arms, negation). |
| [#500](https://github.com/aontu-lang/aontu/issues/500) | paths | open | M | Relative path in a spread template names nothing at members a link or copy makes |
| [#504](https://github.com/aontu-lang/aontu/issues/504) | paths | open | L | Relative path in alias body or path-reference copy reads by source order; ruling 26 says at copy |
| [#691](https://github.com/aontu-lang/aontu/issues/691) | paths | open | M | A map spread's template cannot read a sibling it supplies at a member written in the same map. |
| [#482](https://github.com/aontu-lang/aontu/issues/482) | prefs | open | M | A made default clash (`pref(1 \| 2)`, meets) reads invalid under vet, where a written clash is error. |
| [#700](https://github.com/aontu-lang/aontu/issues/700) | prefs | open | L | A path in a live disjunction arm or lone preference waits; both ports say incomplete, the definition valid. |
| [#702](https://github.com/aontu-lang/aontu/issues/702) | prefs | open | M | Lone preference with an outside path: both ports' vet contradicts their own eval; definition sides with eval. |
| [#704](https://github.com/aontu-lang/aontu/issues/704) | prefs | open | M | A lone preference's parent arm lifts a path inside it to any, not the parent type it reads. |
| [#714](https://github.com/aontu-lang/aontu/issues/714) | prefs | open | L | Meeting preferences of different ranks drops the higher rank's constraint and default; rulings 41, 42, decision 43. |
| [#488](https://github.com/aontu-lang/aontu/issues/488) | relations | likely-fixed | S | Relative link in an alias body: vet read it at the use, eval at the body |
| [#493](https://github.com/aontu-lang/aontu/issues/493) | relations | likely-fixed | S | eval and vet read a relate list or map leaf's relative address from different positions |
| [#536](https://github.com/aontu-lang/aontu/issues/536) | relations | likely-fixed | S | Link copied whole by path references flowed one template at an order-dependent place |
| [#542](https://github.com/aontu-lang/aontu/issues/542) | relations | open | M | A container a later meet brings into a relation holds no link in both engines |
| [#594](https://github.com/aontu-lang/aontu/issues/594) | relations | likely-fixed | S | rel(t) against list data: claimed definition said incomplete; was a measurement error |
| [#661](https://github.com/aontu-lang/aontu/issues/661) | relations | open | M | Engines read a link template's relative path values where written; ruling 50 reads them at the target. |
| [#811](https://github.com/aontu-lang/aontu/issues/811) | relations | open | M | `relate()` met with a scalar kind waits as incomplete in both ports; definition reads error. |
| [#343](https://github.com/aontu-lang/aontu/issues/343) | scalars | open | M | `string & (string & empty())` admits the empty string in both ports; the definition refuses it. |
| [#527](https://github.com/aontu-lang/aontu/issues/527) | scalars | open | S | neq over a nested list written in place expands it twice; path form expands once |
| [#387](https://github.com/aontu-lang/aontu/issues/387) | subsume | open | M | subsume says a recursive list subsumes `[integer, any]`, though `[1, 5]` is a witness against it. |
| [#424](https://github.com/aontu-lang/aontu/issues/424) | subsume | open | S | `subsume` under defaults ignores a default at a list position in both ports. |
| [#361](https://github.com/aontu-lang/aontu/issues/361) | trials | open | M | A name reached through its own trial with nothing between is decided by the budget, not an error. |
| [#535](https://github.com/aontu-lang/aontu/issues/535) | trials | needs-ruling | M | Trial eager arguments: nil questions settled; conflict below argument top is error in ports, invalid in definition |
| [#818](https://github.com/aontu-lang/aontu/issues/818) | trials | needs-ruling | M | `match()` met with the map whose field it reads never settles: incomplete in ports, error in definition. |

### Both engines wrong (18)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#517](https://github.com/aontu-lang/aontu/issues/517) | decls | open | M | Spaced name set in export publishes nothing, and as destructure head fails with no_path |
| [#805](https://github.com/aontu-lang/aontu/issues/805) | decls | open | M | Evaluation accepts an unused body's destructure of an unexported name that vet refuses, in both ports. |
| [#751](https://github.com/aontu-lang/aontu/issues/751) | generators | open | M | Generator over its own enclosing bag refused as not a bag (filter_data etc.); misdiagnosed, often acyclic. |
| [#754](https://github.com/aontu-lang/aontu/issues/754) | generators | open | M | Filter condition in a member pack, each or apply makes cannot read the member: answers empty, no error. |
| [#319](https://github.com/aontu-lang/aontu/issues/319) | jsonschema | open | M | allOf members typing one property differently import as nil, refusing every object instead of forbidding the key. |
| [#668](https://github.com/aontu-lang/aontu/issues/668) | marks | open | M | `move` of a list element drops it from output, but vet keeps its position; output fails vet. |
| [#749](https://github.com/aontu-lang/aontu/issues/749) | marks | open | M | close() or open() wrapping a map whose member reads a sibling never resolves: mapval_no_gen. |
| [#731](https://github.com/aontu-lang/aontu/issues/731) | modules | open | M | An included file whose root is a list is silently dropped at a map root; parity faults too. |
| [#395](https://github.com/aontu-lang/aontu/issues/395) | output | open | S | Canon drops the meta() record from a spread template that comes from an alias, in both ports. |
| [#349](https://github.com/aontu-lang/aontu/issues/349) | parser | open | S | `*(` before a literal container reads as an implicit bag: an error alone, silently dropped in a disjunction. |
| [#475](https://github.com/aontu-lang/aontu/issues/475) | paths | open | S | `path()` capture splits a quoted key holding a dot into two steps, in both ports. |
| [#431](https://github.com/aontu-lang/aontu/issues/431) | prefs | likely-fixed | S | A concrete value lost to a default by declaration order (`**default`, value, `*default`). |
| [#491](https://github.com/aontu-lang/aontu/issues/491) | relations | open | M | vet answers valid where eval refuses with relation_cycle or relation_inverse_missing, both engines |
| [#771](https://github.com/aontu-lang/aontu/issues/771) | relations | open | M | relate() whose template is a subtype built from the declaring type is unify_cycle at the declaration, even unused. |
| [#779](https://github.com/aontu-lang/aontu/issues/779) | relations | open | M | Relation range naming a subtype is held by name and unfolded once; `subsume` then answers undecided. |
| [#810](https://github.com/aontu-lang/aontu/issues/810) | relations | open | L | Link under a key containing a dot gets an address another path shares; reaches and acyclic misread it. |
| [#321](https://github.com/aontu-lang/aontu/issues/321) | subsume | open | M | breaking and subsume answer undecided for any range change inside a spread template; outside one they decide. |
| [#748](https://github.com/aontu-lang/aontu/issues/748) | trials | open | L | Paths into a container met with len, unique, when, must, nof, contains or rest resolve to nothing. |

### Diagnostics only (27)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#755](https://github.com/aontu-lang/aontu/issues/755) | cli | open | S | Errors finding of relations, reaches, view, trim, jsonschema names included files absolutely; Go loses the position (-1:-1). |
| [#331](https://github.com/aontu-lang/aontu/issues/331) | decls | open | M | An alias refusal for a hoisted value or included map is framed at different columns in each port. |
| [#332](https://github.com/aontu-lang/aontu/issues/332) | generators | open | S | An alias reference in an uninstantiated nested template is refused at `$.x.&.&` in TypeScript, `$.x.&` in Go. |
| [#328](https://github.com/aontu-lang/aontu/issues/328) | jsonschema | open | M | A refused operand met from the 2020-12 meta-schema's vocabularies names a different ident() site in each port. |
| [#391](https://github.com/aontu-lang/aontu/issues/391) | marks | open | S | A refusal inside meta() or deprecate() over a disjunction is sited at different columns in each port. |
| [#616](https://github.com/aontu-lang/aontu/issues/616) | modules | open | M | Use case 18: list template met with a string reports `list` in TypeScript, `scalar_kind` in Go. |
| [#658](https://github.com/aontu-lang/aontu/issues/658) | modules | open | S | A site in a built-in model frames the entry document's lines in TypeScript; Go frames the model. |
| [#734](https://github.com/aontu-lang/aontu/issues/734) | modules | open | S | A `pref_not_instance` lint for a default in an included file names the entry document, differently per port. |
| [#324](https://github.com/aontu-lang/aontu/issues/324) | parser | open | M | A refusal frame cuts a source line over 333 characters in TypeScript and prints it whole in Go. |
| [#327](https://github.com/aontu-lang/aontu/issues/327) | parser | open | M | An unresolved reference in a call's first argument is sited at different columns in each port. |
| [#333](https://github.com/aontu-lang/aontu/issues/333) | parser | open | S | A bare-punctuation refusal in a top-level list names `$.0` in TypeScript and `$.1` in Go. |
| [#518](https://github.com/aontu-lang/aontu/issues/518) | parser | open | S | Destructure as a list element: TS refuses alias_not_toplevel, Go fails to parse |
| [#685](https://github.com/aontu-lang/aontu/issues/685) | parser | open | S | A call whose name holds `=` is sited at the `=` in TypeScript, at the name in Go. |
| [#330](https://github.com/aontu-lang/aontu/issues/330) | paths | open | M | A key missing under a reference to a deeper target is reported at a nonexistent path. |
| [#772](https://github.com/aontu-lang/aontu/issues/772) | paths | open | S | Go reports an unfilled member of a multi-step reference's copy at a path keeping the reference's steps, $.v.C.n. |
| [#775](https://github.com/aontu-lang/aontu/issues/775) | prefs | open | M | Refusal inside the one disjunction arm the data selects is reported as empty at the member, naming nothing. |
| [#489](https://github.com/aontu-lang/aontu/issues/489) | relations | likely-fixed | S | refer_unresolved and rel_unresolved hints showed bare strings as addresses, which the engines refuse |
| [#746](https://github.com/aontu-lang/aontu/issues/746) | relations | open | S | Pattern beside `relate()` in a declaration from another source: Go paths it `$.%P`, TypeScript the member. |
| [#773](https://github.com/aontu-lang/aontu/issues/773) | relations | open | S | relation_cycle frame loses the edge when the member meets a waiting constraint: TS frames nil, Go whole member. |
| [#776](https://github.com/aontu-lang/aontu/issues/776) | relations | open | M | Relation's refused range is reported at the target and the template, never at the link naming the target. |
| [#815](https://github.com/aontu-lang/aontu/issues/815) | relations | open | S | `relation_cycle` finding names the first edge out of the cycle's first node, possibly off the cycle. |
| [#313](https://github.com/aontu-lang/aontu/issues/313) | scalars | open | S | `upper(1, 2)` headline reads "Cannot range values" in TS, "Cannot resolve value" in Go; code and hint agree. |
| [#457](https://github.com/aontu-lang/aontu/issues/457) | scalars | needs-ruling | M | A call's refusal renders a driven argument by value in TS, as written in Go. |
| [#605](https://github.com/aontu-lang/aontu/issues/605) | scalars | likely-fixed | S | Go sited a member `super` lifts that cannot generate at `$`; TypeScript names the member. |
| [#735](https://github.com/aontu-lang/aontu/issues/735) | subsume | open | M | `subsume`/`breaking` lose a meet member's site: TypeScript writes -1:-1, Go 1:1. |
| [#774](https://github.com/aontu-lang/aontu/issues/774) | subsume | open | S | subsume and breaking answer verdict error, exit 4, with no finding naming the failing document or cause. |
| [#719](https://github.com/aontu-lang/aontu/issues/719) | trials | open | S | TypeScript leaks the internal trial-nil sentinel, unsited, where Go answers `pref_rank_clash`. |

### The definition itself (6)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#403](https://github.com/aontu-lang/aontu/issues/403) | decls | open | M | Definition: a selection in a recursive body over an open scrutinee lacks a VetP theorem and rows. |
| [#381](https://github.com/aontu-lang/aontu/issues/381) | jsonschema | likely-fixed | M | Definition P6 lacked six importer forms: key(0), riders meta/deprecate/ident, and the words map and list. |
| [#829](https://github.com/aontu-lang/aontu/issues/829) | process | open | L | Tracking list of remaining definition and proof redundancy left after the first review pass, #827. |
| [#828](https://github.com/aontu-lang/aontu/issues/828) | relations | open | S | Oracle `readThroughCases` lists `relate([_])` against `"x"` twice, so dr27–dr29 repeat dr21–dr23. |
| [#826](https://github.com/aontu-lang/aontu/issues/826) | scalars | open | S | `Val.beq` lacks same-constructor cases for map, list and hole kinds, so each reads unlike itself. |
| [#432](https://github.com/aontu-lang/aontu/issues/432) | trials | open | M | Definition reads a waiting `+` inside a trial as refusing; both ports wait (incomplete). |

### Tooling (9)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#318](https://github.com/aontu-lang/aontu/issues/318) | cli | open | M | vet --coverage reports VACUOUS 0/4 when a schema reaches data through a disjunction of closed records. |
| [#322](https://github.com/aontu-lang/aontu/issues/322) | cli | open | S | Three rough edges: `aontu why` gives no model-why hint; pinned default keeps its marker; NilVal lacks message. |
| [#340](https://github.com/aontu-lang/aontu/issues/340) | cli | open | L | Review all 30-odd verbs and about 89 long flags for need, single meaning, documentation and parity. |
| [#732](https://github.com/aontu-lang/aontu/issues/732) | cli | open | M | `vet --coverage` reports VACUOUS when a template or member value is written as a meet. |
| [#747](https://github.com/aontu-lang/aontu/issues/747) | cli | open | S | fmt moves an own-line comment before a non-first &: entry onto the previous entry's line, both ports. |
| [#320](https://github.com/aontu-lang/aontu/issues/320) | lsp | open | M | LSP publishes an included file's error against the open document, at the included file's row and column. |
| [#443](https://github.com/aontu-lang/aontu/issues/443) | process | open | S | Vale drops alerts around an HTML entity spelling a tag in a code fence. |
| [#813](https://github.com/aontu-lang/aontu/issues/813) | process | open | S | Go sources are not gofmt-clean and no Makefile target or workflow checks gofmt. |
| [#814](https://github.com/aontu-lang/aontu/issues/814) | web | open | S | Playground bundle is stale and a rebuilt one fails the smoke check on `structuredClone`. |

### Documentation (1)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#789](https://github.com/aontu-lang/aontu/issues/789) | cli | open | S | Documented deep imports `aontu/dist/val/*` and `aontu/dist/lsp` fail under ESM and nodenext. |

### Design questions (6)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#738](https://github.com/aontu-lang/aontu/issues/738) | decls | needs-ruling | L | Proposal: a declaration has no place; its body is read at each use like a template. |
| [#825](https://github.com/aontu-lang/aontu/issues/825) | output | open | M | Ruled: rename gen notation options `as`, `case`, `keys` to `form` across model, ports, rows, docs. |
| [#830](https://github.com/aontu-lang/aontu/issues/830) | prefs | duplicate-of-#465 | M | Asks whether `*expr` and `pref(expr)` agree for scalar defaults; `*key()` fails, `pref(key())` works. |
| [#777](https://github.com/aontu-lang/aontu/issues/777) | relations | open | L | Proposal: a relation's range checks its target instead of meeting into it; ruled 2026-11-17 for checking, unbuilt. |
| [#819](https://github.com/aontu-lang/aontu/issues/819) | subsume | open | L | No subsumption rule for a relation's member template against a linked member; `breaking` stays undecided. |
| [#366](https://github.com/aontu-lang/aontu/issues/366) | trials | likely-fixed | S | A literal too long for its size is error, too short invalid; asked which reading the language means. |

### Process (1)

| # | area | status | effort | what it is |
|---|---|---|---|---|
| [#611](https://github.com/aontu-lang/aontu/issues/611) | process | open | S | Union merge of the prompt log drops shared closing fences, leaving entries unclosed; no automated guard. |
