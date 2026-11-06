# A core and its translations: a consolidation study

**Status:** ACCEPTED, 2026-11-06: restructure in the three steps of
§6, 4.1 first, and for holes, option (a), explicit application, which
is decision 34 of
[DEFINITION.0.md §7](DEFINITION.0.md#7-decisions-ruled-and-open). Nothing
below is built yet. The study asks whether the definition's special
cases can be cut by restating a few features as a small core plus
translations into it. Rulings stay in §7.

**Origin:** the maintainer, 2026-11-06 (`sketch/PROMPT-LOG.md`): *"is
it normal for a lean description like this to be so large? does this
indicate the aontu language is underspecified? Have we just created
lots and lots of special cases?"*, and the same day, the choice of a
consolidation study before more gaps are filled.

**Method:** counts from `main` at c8556f38, on the day. Section 7 gives
the rules and the lists behind every number. A declaration's lines are
put under a feature by its name, and an issue, a ruling or a limit by
its subject, so the split is close, not exact. The engine figures come
from a read of both engines' sources and are estimates, except where a
routine is named and measured.

## 1. The size, and what it is made of

| Part of `spec/Aontu/` | Lines |
|---|---|
| Proofs, the bodies of 872 theorems | 11,951 |
| Definitions, the bodies of every `def`, `structure` and `inductive` | 4,834 |
| Docstrings and comments | 3,544 |
| Declaration headers, namespaces and the like | 2,745 |
| Blank lines | 2,366 |
| **In all** | **25,440** |

`spec/Oracle.lean`, which generates the shared rows and defines
nothing, is another 6,648.

The semantics proper is under 5,000 lines. Proofs outweigh it by more
than two to one, which is the usual shape of a mechanised definition.

The language was underspecified before the definition existed: the two
engines were its only specification. Each of the 33 decisions in §7
settles a question the language had no single answer to, and most of
the 86 open issues, with the 109 rows of `spec/ledger.tsv`, are places
where the engines part from each other or from the definition. Finding
those is what the definition is for.

The other question is whether the work is turning into a pile of
special cases. In one region, it is.

## 2. Where the special cases live

| Feature | Definition lines | Proof lines | Rulings | Limits | Open issues | TypeScript / Go lines |
|---|---|---|---|---|---|---|
| Holes filled by a peer | 319 | 902 | 4 | 8 | 4 | 480 / 560 |
| Generators, and templates read per member | 298 | 666 | 1 | 3 | 4 | 1,500 / 1,600 |
| Paths, path values and copies | 198 | 353 | 5 | 2 | 8 | 1,000 / 1,150 |
| Links (`refer`, `rel`) | 181 | 427 | 2 | 2 | 10 | 1,250 / 1,300 |
| Relative paths and `key(n)` | 101 | 196 | 1 | 0 | 8 | 350 / 650 |
| `move` | 48 | 7 | 0 | 1 | 1 | 100 / 60 |
| **These six** | **1,145 (24%)** | **2,551 (21%)** | **13 of 33** | **16 of 21** | **35 of 86** | **about a third of each engine** |

The engine figures overlap, since one routine often serves several
features. An earlier figure needs correcting: the 46% quoted in
conversation was the share of `Verdict.lean` and `Paths.lean` together,
files that also hold the calls on values and the sources. By feature,
the share is 24%.

The asymmetry is the finding. These six features take a quarter of the
definition and hold three quarters of its known limits, two in five of
its open issues, and four of the last five rulings (29, 30, 31 and 33).
The rest of the definition, the meet, the order, admission, the output
and the checker, is settling: its open items are few, and each is
bounded. These six keep producing new ones.

## 3. Why these six

Each of the six depends on *where* or *when* a term is read, not only
on what it means. They fall into three kinds.

**Implicit binders.** A hole `_` is bound by the generator whose
template holds it, or by whatever meets the call that holds it. A
`key(n)` reads a key above where the term stands. A relative path or a
relative address reads from where it stands. The language has already
chosen where that is: where the value finally stands, so a copy is a
destination that reads its binders again (ADR-025, rulings 22 and 26),
and a template reads them at each member. But each binder finds its
place by a mechanism of its own, at a time of its own. The definition
places a relative path at its written position before evaluation
(`Val.placed`), reads `key(n)` where a term stands (`keyUpAt`), and
reads a link's relative address where the link lands (`Addr.from`).
Ruling 26 isn't built, so a copy's relative paths are still read where
they're written (limit 20). Every place a value can travel to then
needs a rule per binder: a copy, a declaration's body, an arm, a
preference, a generator's instance, an `emit` body, a list after an
absent element. The issues follow that product: `key()` through a
reference (#463), under a preference (#465), in a body (#528), after
an absent element (#539), into a generator's output (#520), and in an
`emit` body, where the engines differ (#524). The engines keep two
notions of "where": the path a term stores, re-rooted at each clone,
and the position it is driven at. [`DIVERGENCE.md`](../DIVERGENCE.md)
records that they tell the two apart by different tests.

**Effects on another position.** A link's template constrains its
target; a `move` hides its source. Both act at a position other than
the one where they're written. The definition finds them by walking
the *written* schema (`linkLanding` in `spec/Aontu/Paths.lean`, and
`Val.moved`), so the walk re-derives what the normal form already
knows: meets, riders, path references, containers and spreads,
generators, and since ruling 33, preferences and disjunctions. Each
form a link can sit inside needs a clause, and the next one, for a
`match`, was being written when this note began. The engines record a
flow when a reference settles, write it into the tree at once, and
apply it again after every pass. A recorded flow can't be taken back,
so they stage flows per arm, per preference (#644) and per admission
trial (#640), and still send from an arm a later meet refuses (#647).

The review of #651 shows the limit. Sending only from the arms the
rank rule picks (#648) was built in both engines and taken back. A
conjunct meets a disjunction with `any` before its other sides, so the
pick dropped a fallback arm's flow while the default still stood, and
a reference records its flow once, so the meet that later took the
fallback had nothing to send. A pick made at one meet can be undone by
a later one, and the flow it dropped can't be recorded again.

**A meet that is sometimes application.** With a hole present, `&`
applies a call to its peer: `upper(_) & hello` is `"HELLO"`, and the
reference says so: "the peer goes into the call and is not also a
constraint on the way out". The definition reads every such meet as a
fill before any meet (`Val.filled`), so that `&` stays a meet
everywhere else. Which meet fills which hole then depends on how the
document groups its meets (limit 9; #512, where `&` doesn't commute
around a call whose argument is the hole), on containers met member by
member, on spreads filled once, and on riders, seals and preferences
around the call (rulings 21, 29, 30 and 31; limits 6 to 13).

The engines' handling of "when" makes the same point from the other
side. They tell it five ways: the pass index (`ctx.cc`), the settling
pass, the argument snapshot (`argsnap`), trial mode (`_trialMode`) and
write-once stamps (`_spr` and the spread snapshots).

## 4. A core, and what translates into it

The proposal keeps the value core as it is and changes how the three
kinds enter it.

### 4.1 Links and moves as obligations a value carries

A link becomes a value that carries its template. The meet of
`refer(t)` with `path(a)` normalises to the address `a` with an
obligation: the target meets `t`. The obligation lives where the value
lives, so it is in an arm, in the result a `match` takes, in a
generator's instance, in a copy or in a spread's member exactly when
the value is. A document's flows are the obligations of the part of
its normal form the output takes: the arms the rank rule picks. Ruling
33 becomes a property of the normal form instead of a clause of a
walk. The flows are met into their targets in rounds, as
`Decls.referPasses` does today, so a template that makes another
link's target still resolves. A `move` is the same thing: an
obligation to hide its source.

What it removes from the definition: the link walk (`LinkItem`,
`LinkItem.next`, `linkStep`, `linkItems`, `linkLeaf`, `linkLanding`,
`Decls.linksAt`, `Decls.landedLinks`, `Val.positionsP`, `Val.nfStep`,
`Decls.pickedAt`, `callLinks`, `referSrc`), 73 definition lines and
161 proof lines, the walk of `Val.moved`, 33 more, and the parked work
on `match` arms. The flows' meet into their targets (`referFlow`,
`Val.putW`, the rounds) stays. Carrying the template costs about as
much as the walk. Today the normal form drops it (`callTerm` makes
`refer(t)` the path kind), and a rider can't hold it, since a rider's
record is data and `Rider` comes before `Val`. So the template needs a
value form of its own, `.link v t`, transparent wherever a rider is:
about one arm beside each of the 114 arms the riders have, and the
proof cases that go with them. The size stays about where it is. The
gain is that no form needs a link clause again: ruling 33, and the
`match` case being written, become properties of the normal form.

What it removes from the engines: about 160 lines in each, the
recording, the live write and its re-entry guard in `ReferVal.settle`,
the staging in `DisjunctVal`, its admission gate and `PrefVal`, and
`applyFlows` after every pass, with their Go counterparts. What it
adds: the obligation in the path value, the meet of two obligations
(their templates meet), the collection over the picked arms, and a
round structure: evaluate, collect the obligations of the result, and
evaluate again with the templates met in, until no obligation is new.
A document without links pays nothing.

What it closes: #647, #648 and #542 (a container a later meet brings
holds its links, since the leaves are read from the normal form), and
#536 together with 4.3. Limit 17 goes, and the first part of limit 19,
a link inside another link's template, since each round reads the
links of its own normal form.

Three choices need a ruling. A link in a declaration's body sends
today whether the body is used or not; collecting each body's own
normal form keeps that. A link in a call's argument, which no landing
enters, sends in both engines and not in the definition (limit 19).
An address the data supplies counts in both engines and not in the
definition (limit 19); collecting from the document the data meets
would count it.

### 4.2 Holes: `_` as a bound variable

The 18 use cases hold 40 holes, and the built-in models none. 39 are a
generator's placeholder, in the template or the source of an `each`, a
`pack` or an `emit`, `match(_, …)` inside a `pack` template among
them. The one that isn't is `match(_, …)` met with the data as a
discriminated union, in use case 07, which keeps it as a failed
attempt (`probes/match-dispatch.aontu`: under `vet` it never settles)
and records the gap as dispatch on a discriminator. Fill by peer lives
in the reference's examples, in one repro, and in 1,680 of the 40,574
shared rows: rows whose document holds a hole and no generator, 1,557
of them the definition's own, 116 the engines' `test/spec/place.tsv`.
A spread whose template holds a hole, `{&: {n: add(_, 1)}}`, is the
same idiom with the member as the peer, and no use case writes one.

Three ways forward:

- **(a) Make application explicit.** A call over a hole is a function
  of its hole, and a form hands it a value; this note writes it
  `apply(v, f)` only to have a name, and the syntax is a choice of its
  own. `_` is then a bound variable, bound by a generator or by
  `apply`, and `&` is a meet everywhere. It removes `Val.filled` and
  its relatives, most of the 319 definition lines and 902 proof lines
  of holes, rulings 21, 29, 30 and 31, limits 6 to 13, and #432, #512,
  #530 and #578. In the engines it removes the fill, most of the 480
  and 560 lines on holes, a generator's binding of `_` aside. It
  breaks no use case. The rows that fill by peer are rewritten or
  dropped, which for the definition's rows means regenerating them,
  and so are the reference's examples. Use case 07's need wants its
  own form, a `match` on the value standing at its position.
- **(b) Restrict fill by peer to the plain case.** A position whose
  sides, flattened, hold one call over a hole and values fills the
  hole with the meet of the values, so grouping can't matter; any
  other shape is an error. It keeps the idiom and removes limits 6 to
  9 and 12, #512, and the special cases of rulings 30 and 31.
- **(c) Keep it,** and keep ruling its cases.

### 4.3 One placement for every binder

The rule is already chosen: a binder reads where its value finally
stands. 4.3 builds it once. A term keeps its relative paths, its
relative addresses and its `key(n)` unread, as written, and one
function reads all three from a position. It runs when a term is put at
a position: its written place, each copy's place (ruling 26), each
member of a template, each use of a body, each instance of a
generator. In the definition this merges `Val.placed`, `keyUpAt` and
`Addr.from`, and builds ruling 26 on the merged function, which
removes limit 20.

In the engines it replaces the routines that keep the two notions of
"where" in step: the re-rooting in the reference resolver (`RefVal.find`
in both), the overlay of a clone's stored path, Go's `repathArg`, and
the `slot` hint that DIVERGENCE.md describes. This is the largest
change of the three, in the engines' busiest code.

What it closes: #330, #463, #465, #468, #488, #492, #493, #500, #501,
#504, #520, #528 and #539; #524 with a ruling on an `emit` body's
position; and #536 with 4.1. It changes no ruled answer. It moves the
answers both engines give today where they read a copy's relative
paths by source order (#504), which ruling 26 already says they must.

## 5. What the engines would need

From the read of both engines: their evaluators run to about 17,700
lines in TypeScript and 15,500 in Go, and the six features take 5,000
to 6,000 lines in each. Three routines carry most of it, in both: the
reference resolver (`RefVal.find`, `go/ref.go`'s `find`), where
relative paths, copies, `move`, marks, the argument snapshot,
recursion and aliases meet; the spread arms of maps and lists; and the
function base's `unify`, which holds the staging gate, the hole fill
and the settling-pass checks.

- 4.1 changes the reference's settle, the path value, `DisjunctVal`,
  `PrefVal` and the driver, and adds the rounds. No answer the
  definition gives today changes.
- 4.2 (a) adds the application form to both parsers and deletes the
  fill; (b) narrows the fill and adds an error.
- 4.3 changes the resolver and the clone in both, and moves the
  answers on which the engines and ruling 26 already disagree.

## 6. Options, and a recommendation

| Step | Language change | Definition | Engines | Closes |
|---|---|---|---|---|
| 4.1 links and moves as obligations | none; three small rulings | M, about size-neutral | M | #542, #647, #648; #536 with 4.3; limit 17, part of 19; the `match` work |
| 4.2 (a) `_` bound, application explicit | yes: fill by peer moves to a new form | S, mostly deletion | M | rulings 21, 29 to 31; limits 6 to 13; #432, #512, #530, #578 |
| 4.2 (b) plain fill only | yes: some shapes become errors | S | S | limits 6 to 9, 12; #512 |
| 4.3 one placement | none: builds rulings 22 and 26 | M | L | 13 issues, #524 with a ruling; limit 20 |

The sizes are the register's S, M and L.

**Recommendation: restructure, in three steps, and decide 4.2 first.**

- **Decide 4.2 now, and take (a).** It is the one step that changes the
  language, and the evidence is in: no use case fills a hole by its
  peer, the one attempt failed, and holes are the largest special
  region of the definition. Under (a) `&` is a meet everywhere, so a
  document's meaning can't depend on the order of its meets, which is
  what a unifier promises. (b) is the cautious alternative.
- **Build 4.1 first.** It needs no change to the language and no
  further decision, and it fixes defects (#647, #648) that the present
  design can't fix without carrying an arm's flows with its value,
  which is 4.1. It isn't the smallest step: in the definition it is
  about size-neutral, where 4.2 (a) is mostly deletion, but 4.2 waits
  on the syntax of its application form.
- **Then 4.2, as decided, then 4.3.** Under (a), 4.2 goes before 4.3,
  since it deletes the fill that 4.3 would otherwise have to carry
  through every placement. 4.3 is the largest step and is best taken
  last, on a smaller engine.

Work in flight, meanwhile: #651 has merged, which fixed TypeScript's
dedup order (#649). The `match`-arm work is parked, since 4.1 makes it
a consequence. #647 and #648 wait on 4.1. The definition's other
limits, outside the six features, can go on being filled while the
choice is made.

## 7. How the counts were made

**Lines.** A line is counted in a declaration's body: after its
header, not blank, and not a comment or docstring. Each declaration
goes under the first feature whose pattern its name matches, in this
order, as Python regular expressions:

```
links            refer|Refer|\brel|Rel[A-Z]|relKind|relName|[Ll]ink|[Ll]and|[Ff]low|putW|Addr\.from|positionsP|picked|[Tt]aken|nfStep|bodyRoot|addrs|addrOf
holes and fill   [Hh]ole|[Ff]ill|[Ww]ait|[Pp]lace(?!d)|bindHole|[Hh]eld|pending|meetFilled|spreadWith|memberAt|elemAt|joinFields|holdsFill|fillable
generators       each|pack|emit|Emit|filter|Filter|[Mm]ember|[Ii]nst|[Tt]mpl|[Tt]emplate|perMember|relBlank|relPart|opened|blank|neutral|spreadRoot|genSteps|matchRead|[Nn]ode|spreadInst|spreadItems|spreadFields|alike
relative, keys   placed|Placed|keyUp|keyUpAt|atKey|[Kk]eyed|bares|plBare|stepped|unplaced|holdsKey|keyPairs
paths, copies    [Pp]ath|ofPaths|withPaths|rounds|roots|pathIn|pathAt|docPaths|strictPaths|[Rr]esolves|unmark|stepIn|atW|\bat\b|Val\.at$|positions|stepItems|landing
move             [Mm]ove|hideAt|stepsW
```

Further patterns take the rest: sources and modules, calls on values,
marks and riders, selection and trials, verdicts, and the core. They
hold 76% of the definition lines and 79% of the proof lines. A name can
mislead: `resolveD`, the largest definition, serves every feature and
counts in the core.

**Rulings,** by subject, of the 33 in DEFINITION.0.md §7: holes 21,
29, 30 and 31; generators 22; paths, path values and copies 6, 7, 23,
26 and 27; links 25 and 33; relative paths and keys 13.

**Limits:** the 21 that [`spec/README.md`](../spec/README.md) lists
under "What it does not yet hold", numbered in the order it gives
them: holes 6 to 13; generators 5, 14 and 15; paths, path values and
copies 20 and 21; links 17 and 19; `move` 16.

**Open issues,** by subject, of the 86 open on the day:

- holes: #432, #512, #530, #578;
- generators and templates: #332, #466, #520, #633;
- paths, path values and copies: #330, #357, #416, #471, #472, #474,
  #475, #504;
- links: #488, #489, #491, #492, #493, #536, #542, #594, #647, #648;
- relative paths and keys: #463, #465, #468, #500, #501, #524, #528,
  #539;
- `move`: #486.

**Holes in the use cases:** each `_` that stands alone in a
`use-cases/**/*.aontu` or `aontu/**/*.aontu` file, outside comments
and strings, read in its context. **Rows:** each line of
`test/spec/*.tsv` that isn't a comment and has an id, a mode and a
document; a row fills by peer, roughly, where its document holds such
a `_` and no `each`, `pack`, `emit` or `filter`.
