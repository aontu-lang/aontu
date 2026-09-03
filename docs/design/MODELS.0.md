# Language-supplied models — the `aontu:` prefix, their form, their aliases

**Status:** PROPOSED. Design only. The two models this note is about —
`std/system` and `std/view` — exist and are marked EXPERIMENTAL in
their own source; nothing below is built.

**Origin:** Richard Rodger, 2026-09-03: language-supplied models
should all carry the prefix `aontu:` — as Node's `node:` does — so they
cannot be confused with local modules; their source should always
match `aontu fmt` output and pass linting; the current ones use
initial capitals for keys where lower case is preferred; and they do
not export `%` aliases. A second question the same day: when `%`
aliases are imported from a module, what is the syntax to rename them
— the case where two modules export the same name.

**Method:** every claim about what the engine does *today* was probed
against the tree at `b06fba2`, and carries its probe. The blast radius
of the rename is measured, not estimated. Claims about what it
*should* do are argument, and are marked as such. This note leans on
two others: [FMT.0.md](FMT.0.md) for the form, and
[ALIASES.0.md](ALIASES.0.md) for what an alias is and for the P2 it
proposes and has not built.

---

## 1. What is wrong today

Two models ship inside the engine: `std/system` (the system
vocabulary — ports, components, services) and `std/view` (the schema
for a view document). Both are served from memory by a resolver leg
that runs **before** the file leg
(`makeModelResolver` in `ts/src/lang.ts`; `msOptions` in `go/lang.go`).

**The name is a path, and it is not the path it looks like.** Probed:
a project holding its own `./std/system.aon` — `std: { Service:
"LOCAL" }` — and writing `@"std/system"` gets the *bundled* model, not
its file. The memory leg wins, silently. So today's spelling has both
confusions the prefix exists to prevent: a reader takes `std/system`
for a relative path (it looks like one, and `@"./spec.aon"` beside it
is one), and an author who creates that relative path finds it cannot
be reached by its own name.

**The keys are capitalised** — `Port`, `Component`, `Service`,
`Figure` — where the form this project is settling on
([FMT.0.md §4.1](FMT.0.md)) prefers `port`, `component`, `service`,
`figure`. The models are the language's own examples; they should be
written the way the language asks documents to be written.

**They name no aliases.** A document using the system vocabulary
writes `$.std.Port` — a path reference into the model's tree. That
works, and it is the only way, because the models declare no `%`
aliases. An alias is the right tool for exactly this: a named shape,
with no path, erased before canon
([ALIASES.0.md §4](ALIASES.0.md)).

**Nothing holds their text to the form.** The source is a string
constant in `ts/src/std.ts` and `go/std.go`, byte-identical across the
ports (pinned by `test/spec/std-system.tsv` and `std-view.tsv` through
its canon and hash). `aontu fmt` landed in 0.56.0 and its corpus gate
covers every `.aon` under `use-cases/` and `test/spec/files/`; the
standard library is not in that set, so no gate yet says it is
formatted or lint-clean.

## 2. The prefix

**D1.** A language-supplied model is spelled `@"aontu:NAME"`:
`@"aontu:system"`, `@"aontu:view"`. The scheme is Node's device
(`node:fs`, and mandatory for `node:test`): a prefix no relative path,
package name or module path can spell, so the resolver can route on it
before any other leg is consulted and never touch the filesystem for
it.

Rules, each of which is a spec row:

- `aontu:NAME` resolves from the engine's own table and nowhere else.
  The file leg, the package leg and the module leg are never asked.
- An unknown name — `@"aontu:nope"` — is refused with the not-found
  code the include machinery already uses, and the message names the
  set: `source not found: aontu:nope (the language-supplied models
  are aontu:system, aontu:view)`. A typo should not go looking on
  disk.
- The models stay available under every include capability but
  `none`, as they are today: a source that never leaves the process
  widens no hermeticity posture.
- `std/system` and `std/view` **stop resolving from memory**. They
  become what they look like — relative paths — and a project that has
  such a file gets its file. For the transition, an include of exactly
  `std/system` or `std/view` that finds no file is refused with a
  message that says where the model went:
  `source not found: std/system (the language-supplied models moved to
  @"aontu:system" and @"aontu:view")`. X-1 in §8 is whether that hint
  is enough, or the old spelling should keep working for a release.

**Measured blast radius of the rename**, over both repositories: 38
files mention `std/system` or `std/view` — the two sources, the two
spec files (36 rows between them), the API and language references,
`trust.md`, one how-to, `CHANGELOG.md`, `ADR.md`, the design notes and
review pages that record the decisions, the 01-service-catalog case
(five files), two other cases' view documents, and the site's synced
copies. All of it is a search-and-replace except the resolver, the
error message and the spec rows.

## 3. The form

**D2 — Lower-case keys.** `Port` → `port`, `Component` → `component`,
`Service` → `service`, `Figure` → `figure`. A path reference into the
model becomes `$.std.port`.

**D3 — The root key is the model's name.** `@"aontu:system"` should
place its vocabulary under `$.system`, and `@"aontu:view"` already
places its own under `$.view`. Today the system model's root is `std`,
which was the name of the *family*; with the family named by the prefix
the root can name the *model*, and a reader who sees `$.system.service`
can find the include line that brought it in. X-2 records the doubt:
this is a second rename on top of the casing, and `$.std.Service` →
`$.system.service` is the one line every consumer of the model has to
change. The note recommends taking both at once, because a rename that
happens twice costs twice.

**D4 — The source is `aontu fmt`-clean and lint-clean.** Once
[FMT.0.md](FMT.0.md) P1 lands, a test in each port asserts
`fmt(STD_SYSTEM) == STD_SYSTEM` and the same for the view model; once
P4 lands, that `--lint` reports nothing on either. The models are the
first documents held to the form, on purpose: if the language's own
examples cannot pass its formatter, the formatter is wrong or the
examples are.

Written to the form as it stands, the system model reads:

```
# aontu:system --- the system vocabulary. ...

%port: type({
  direction: *in | out | inout
  protocol?: string
})

%component: type({ ports?: { &: %port } })

%service: type({
  kind: service
  ports?: { &: %port }
})

system: { port: %port  component: %component  service: %service }
```

*(Argument, hand-formatted: written before `aontu fmt` landed, and the
`&: %port` inside braces is X-7 of FMT.0.md as decided.)* The last
line is [ALIASES.0.md](ALIASES.0.md)'s shorthand written out —
`{ %port, %component, %service }` once the shorthand exists — and it
is what keeps the path form working: `$.system.port` is still there
for a document that wants a path.

## 4. The aliases

**D5 — A model declares an alias for each shape it publishes**, and
its tree is built *from* the aliases (§3's last line), so the alias is
the name and the path is a view of it. A document then writes
`ports: { &: %port }` rather than `ports: { &: $.std.Port }` — no
path, nothing to misspell, and the erasure rule means the two
documents hash identically.

**How the aliases reach the document.** Probed: an include spliced at
the root — `@"./lib.aon"` on its own line — carries `lib`'s alias
declarations into the includer, and `%port` written after it resolves
(`{"listen":80,"std":{"port":integer&min(1)}}`); the same include
bound under a key, `x: @"./lib.aon"`, does not (`Cannot resolve value
at path $.listen`), which is the rule
[ALIASES.0.md](ALIASES.0.md) states — a declaration must sit at the
document's root, and a spliced file *is* the document's root. So the
common case needs no new machinery at all: `@"aontu:system"` at the
top of a document, and its aliases are in scope. The alias
`%port` and the path `$.system.port` are the same value, declared
once.

**Language-supplied models must not share an alias name.** Two
spliced files that both declare `%port` do not collide — their
declarations *meet*, silently if the values are compatible and as a
conflict if not. That is the right rule for a document's own files and
the wrong outcome for a library, so the set of bundled models carries
a gate: no alias name is declared by two of them. With two models and
four names it is a trivial test; it is written so the fifth model
cannot break it.

## 5. Importing with a rename

This is the second question at the origin, and it is
[ALIASES.0.md](ALIASES.0.md) P2's question, not this note's to settle
— but the models are the first library anyone will import aliases
*from*, so the spelling is proposed here as an amendment to that note.

**What P2 proposes today.** A destructure on the left of `=`, both
sides sigilled, key the local name and value the exported one:

```
{ %u8: %uint8 } = @"types.aon"       # rename
{ %uint8, %port } = @"types.aon"     # by name
{%} = @"types.aon"                   # every export
```

**Why it should not be spelled that way.** The same note's §10 argues,
correctly, that the declaration needs no `=` — `%foo: value` already
parses — and that once `=` goes, the destructure is the one form left
wanting a spelling. It names `%{ … }: …` as available (a parse error
today). This note takes that up:

```
%{ sysport: %port }: @"aontu:system"     # rename: local %sysport is the model's %port
%{ %port, %service }: @"aontu:system"    # by name, unchanged
%*: @"aontu:system"                      # every export
```

The key is the local name, with the sigil implied by the `%{` that
opens the pattern; the value is the remote alias, sigilled because it
is a reference. That is the shorthand rule the note already has (key
without the sigil, value with it), read as a binding. `%*` is the
wildcard, and `*` can carry it: on the key side of a pair it has no
other meaning, where in value position it is the preference marker.

**Why the rename has to be at the import and not after it.** Under
today's P1, `%u8: %port` after a splice is legal — alias-of-alias —
but it does not solve the case at the origin. If two modules both
declare `%port`, the two declarations have *already met* by the time
any later line runs; the local rename can only name the meet. The
pattern binds *before* the names land, which is the only place a
collision can be prevented rather than reported. That is also why
this note's D5 gives the language-supplied set a no-shared-names gate
rather than relying on renaming: a library should not require its
users to know its collisions.

**Not proposed here:** `export`. Whether a model publishes every
alias it declares (P1's splice rule, in effect) or only a declared
subset is [ALIASES.0.md §5](ALIASES.0.md)'s question. For the bundled
models the answer is the same either way — they declare exactly what
they publish.

## 6. Gates

- `test/spec/std-system.tsv` and `std-view.tsv`: the include spelled
  `@"aontu:system"` / `@"aontu:view"`; the not-found message for an
  unknown `aontu:` name; the moved-model message for the old
  spellings; the aliases resolving after a root splice; the canon and
  hash rows re-derived for the lower-case keys.
- A test in each port: no alias name declared by two bundled models.
- After FMT P1: `fmt(model) == model`, both models, both ports.
- After FMT P4: `--lint` clean on both.
- The use cases that include a model pass unchanged in behaviour after
  the rename — `01-service-catalog` above all, whose `spec.aon`
  references `$.std.Port` and `$.std.Service` and whose check pins its
  outputs.
- The site: synced pages carry the new spelling; the sync's link
  checker is unaffected (no page links a `std/` path).

## 7. Phases

| phase | delivers | needs |
|---|---|---|
| **M0** — the prefix, the casing, the root key, the aliases | D1–D3, D5; the resolver leg; the two messages; the spec rows re-derived; the use cases, docs and site updated; CHANGELOG | nothing — independent of `fmt` |
| **M1** — formatted | D4's first half: the models rewritten in the form, and the `fmt`-clean gate | FMT P1 |
| **M2** — linted | D4's second half | FMT P4 |
| **M3** — import with rename | §5, as ALIASES P2 | that note's X-1 settled |

M0 can go first and should: it is a breaking rename of an EXPERIMENTAL
surface, and the sooner it happens the fewer documents it breaks.

## 8. Open questions

- **X-1 — Do `std/system` and `std/view` keep resolving for a
  release?** The note recommends no: both are EXPERIMENTAL by their own
  header, the moved-model message says exactly what to type, and a
  spelling that keeps working is a spelling nobody changes. The cost
  is one line in every document that includes them, on the day of the
  release that renames them.
- **X-2 — The root key.** `$.system.service` (D3) or keep `$.std.service`
  and change only the casing? The note recommends D3, once, now.
- **X-3 — The wildcard spelling.** `%*: @"…"` as proposed, or
  `%{}: @"…"` for the empty pattern meaning "all"? `%*` reads as "every
  alias"; `%{}` reads as "no aliases", which is the opposite of what it
  would do.
- **X-4 — Does a model publish every alias it declares?** Yes under
  the splice rule as it stands; ALIASES P2's `export` may narrow it.
  For the bundled models the two answers coincide.
