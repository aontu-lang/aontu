# Design: the role gate, `aontu allow`

*Status: **SPIKE** (2026-09-09), TypeScript only. `ts/src/allow.ts` is
the library and `runAllow` in `ts/src/cli.ts` the verb, held by
`ts/test/allow.test.ts`, the `cli-allow` block of `ts/test/cli.test.ts`,
the transcripts in `docs/reference-api.md` and
`docs/how-to/gate-changes-by-role.md`, and use case 18
(`use-cases/18-role-permissions`). The Go port does not have it and no
shared spec mode pins it, so under ADR-001 it is not landed; the
implementation plan at the end is what lands it. Every behaviour
claimed below was probed against the built tree on the day of the
status line.*

## The problem

An agent that operates under a role must ask before it writes. The
write path is in place (`aontu set` appends to an overlay, vets the
result, and refuses a change that contradicts a pin), but nothing in it
knows *who* is asking: `set` answers whether the change holds, never
whether this caller may make it. The rule that said which subtree a
role may touch lived in the agent's prompt, where nothing checks it and
where a second agent with a second prompt disagrees with it silently.

Three constraints shape the answer:

- **Roles are arbitrary strings.** `admin`, `dev`, `product`, `qa`,
  `oncall-eu`: whatever an organisation calls them. The engine cannot
  ship a vocabulary of roles, and must not try; the names are the
  author's.
- **The answer must come from a document that is itself aontu.** A
  rule held in a second format (a YAML policy, a JSON allowlist) is a
  second source of truth with its own parser and none of the
  language's tools: no `why` to say who wrote the rule, no `vet` to
  hold it to a shape, no `close()` to refuse a role nobody declared,
  no spreads or includes to compose one role model from several. A
  role model written in aontu gets all of that for nothing.
- **The verdict is the exit code.** An agent branches on `0` and
  nothing else, as it does for every gate here (`vet`, `set`,
  `breaking`, `render --check`). The text and JSON reports carry the
  reason for a person reading afterwards; the number carries the
  decision.

## The rule, and why it errs towards refusal

A role is a map with an `allow` list and an optional `deny` list, each
entry a path string in the spelling a reference uses: `$.services`,
`$.deploy.*.replicas`. The rule over an asked path:

- **Allowed** when some `allow` entry is an ancestor of the path or
  equal to it. Allowed `$.services` allows `$.services.auth` and
  `$.services.auth.replicas`. It does not allow `$`: a change at the
  root reaches every sibling of `services` too, and an entry never
  covers the map above it.
- **Refused** when any `deny` entry *intersects* the path: an ancestor,
  the path itself, or a descendant. Denied `$.services.*.tier` refuses
  `$.services.auth.tier` (the denied node), and it refuses
  `$.services.auth` and `$.services` too, because a change at either
  could rewrite the tier. Deny wins over allow whatever the order the
  entries were written in.
- **Refused** otherwise: no entry covers it (`uncovered`), or the role
  is not declared (`no_role`).
- `*` matches exactly one segment, any key. It is the only pattern
  character; every other segment is a key or a list index compared for
  equality, as a reference compares them.

The asymmetry is the design. An allow entry covers *downwards only*,
because a grant at `$.services` was a statement about services and
nothing above them. A deny entry refuses in *both directions*, because
the thing it protects can be rewritten from above (replace the whole
service and the tier goes with it) and the protected subtree is worth
more than the convenience of a coarse write. Where the two rules
disagree the refusal wins, and where nothing was said the refusal
wins: a role with no `allow` list allows nothing, and an asked list
with no paths is a usage error rather than an empty `allowed`, so a
caller that dropped its arguments is not let through.

An undeclared role is a *refusal*, not an error. The template (below)
makes the roles map exist, so what can be missing is the role, and a
role nobody declared may modify nothing: the question has an answer,
and the answer is no. The report carries `get`'s `no_path` finding for
the role's path beside the refusals, nearest-name note included, so a
misspelt `--role qas` reads as the typo it is.

Every decision names the entry that made it as a path *into the role
model*, `$.roles.dev.deny.0`, with the entry's text as the author wrote
it. That is what makes `aontu why '$.roles.dev.deny.0' roles.aontu` the
next command: the rule has a file and a line, and the gate says which.

The CLI accepts a path in `set`'s spelling, `<path>=<value>`, so a
skill hands the gate the very arguments the write will get and
nothing is re-spelled between the ask and the write. The value is
checked to be ONE value and is otherwise not the gate's business.
The check exists because `set` appends the value as source after the
flattened path (`"a": "b": <value>`), so a value that carries a
second pair, `3 secrets: key: "x"`, writes `secrets.key` as a sibling
of the overlay root: a gate that ignored the value would answer
`allowed` for `$.a.b` and authorise a write to a subtree it was never
asked about. The review that found it is the reason the sentence
"the value is ignored" appears nowhere in the documentation. Two
smaller refusals sit beside it, both usage errors: every path
argument starts with `$`, so an empty argument or a second filename
is not read as a path and answered, and a role name is one key
without dots, so the entry paths the report names can be followed by
`why`.

## The shape template

The shape of a role is aontu too. The model MEETS it at evaluation,
as data meets a schema under `vet`: a spread template over the roles
map, parsed as a document of its own,

```
roles: { &: { allow: [&: Entry] deny?: [&: Entry] } }
Entry = string & re("^[$]") & re("[^.]$")
```

(quoted keys, and a top-level spread when `--at $` says the roles map
is the document), conjoined with the parsed model and unified once.
Two rules of the meet decide whether it works at all:

- **Both sides are parsed, and unified once.** A parsed tree is
  single-use (AGENTS.md, the mutation caveat), and a model evaluated
  on its own and then met again has already resolved its references
  against itself: a registry written `roles: close({ &: $.Role ... })`
  fails its second pass with a `$.Role` it cannot find. `vet` parses
  its schema afresh for the meet for the same reason.
- **The shape is parsed first.** The context takes the last parsed
  document as its root and as the text an error frame excerpts, and
  both must be the model's: parsed the other way round, `$.Role`
  resolves against the shape and a conflict's frame shows the shape's
  line under the model's file name.

The consequences are the reason for the mechanism:

- A malformed role (`allow: "$.a"`, `deny: [1]`, an entry that is
  empty or does not start at `$` or ends in a dot, a roles map that is
  a number) is refused by the *engine*, with the engine's own code and
  the site of the offending value. The module invents no finding shape
  of its own; the report is `evalFailure`, as it is for `get`, and the
  exit code is 4. The two `re()` patterns are two because `re()`
  refuses a nested quantifier, and an empty entry matters: `pathParts`
  reads `""` and `"."` as the root, so an entry that a template left
  empty would have been the widest grant there is.
- A role with no `allow` list allows nothing, because the template's
  empty list is what the tree holds for it; there is no "missing list"
  branch to write.
- **The lists are read from the written tree, not from the generated
  document.** A `hide()` mark keeps a value out of the output and
  nothing else, and a gate that read the output let `deny:
  hide(["$.a"])` vanish and answered `allowed` for `$.a` while `why`
  still printed the rule: the wrong direction to be wrong in. An entry
  that is a concrete string is taken as written, hidden or not; any
  other entry is asked to generate, which is where a kind (`string`,
  hidden or not) fails with the engine's `no_gen` at the entry's own
  path, and where a preference answers with its default.

The alternative, a hand-written walk that checks `allow` is a list of
strings and `deny` is absent or a list of strings, would have been a
second checker with a second set of messages for a shape the language
already states in one line.

## Rejected designs

**A `--role` argument on `set`.** The write and the gate would be one
verb, and a skill could not forget to ask. Rejected because the
question is asked before more than `set`: an overlay written by hand, a
rewrite proposed as a diff, an `--in-place` edit, a whole-file
replacement. A gate that only `set` runs gates only `set`. The gate is
a verb that takes the paths and nothing else, and every write path
asks it first.

**A built-in `aontu:roles` model.** The bundled `aontu:` models exist
for vocabularies the *engine* owns (`aontu:code`, `aontu:profile`), and
a role vocabulary is the author's: which roles exist, what each is
called, what else a role carries (`desc`, an owner, a review policy).
The engine states the two keys it reads, as a template, and leaves the
rest of the shape to the model.

**Vet against an embedded schema, then walk.** Run the role model
through `vet` against a schema string, and walk the generated value
only when the verdict is `valid`. Rejected because it is the shape
template with an extra step: `vet` reports the same engine codes at the
same sites, and the template gets them by unification with no second
evaluation.

**Appending the shape as text.** The first spike appended the
template line to the model's source and evaluated the result: one
evaluation, no second document, and a frame that showed the line.
Rejected on the review's evidence: the grammar closes an open map at
end of input and lets a dangling `key:` or a trailing `&` take the
next line as its value, so a model ending in `roles: {` put the shape
at `$.roles.roles`, one ending in `foo:` put it under `foo`, and in
each the roles map was never validated: the model's own text decided
whether the shape applied. Prepending is no better (a head line ending
in `|` makes the shape a disjunct the model satisfies). The meet of two
parsed values has no such seam.

**Reading the generated document.** Simplest to write: `node.gen()`
and two arrays. Rejected because generation is where `hide()` acts,
and a hidden `deny` generated to nothing (above).

**Deny only above.** A deny entry refusing the paths at and below it,
and nothing above: the symmetric twin of allow, and simpler to state.
Rejected because it makes the gate trivially bypassable: with
`$.services.*.tier` denied and `$.services` allowed, the ask
`$.services.auth` would be allowed, and the write at `$.services.auth`
may carry a `tier`. A deny that can be rewritten from above protects
nothing.

## Known limitations

- **A closed role vocabulary must declare `deny?`.** The template
  carries `deny?: [&: string]`, and a `Role` written as
  `close({ desc: string allow: [&: string] })` refuses it as
  `[aontu/closed]` for every role, so the verb answers exit 4. The
  reference and the use case say so; the fix is one key in the
  vocabulary, and the alternative (a template that adapts to a closed
  role) would have the engine read the model before deciding what to
  append to it.
- **A key containing a dot is unreachable**, as it is for `get`.
  `pathParts` splits at every dot, quotes included, so
  `$.services."a.b"` is the three segments `services`, `"a`, `b"` and
  no entry can name the key `a.b`. The gate and `get` share the
  splitter on purpose: one spelling of a path, one set of things it
  cannot say. A ROLE is not a path: the library looks it up as one key
  of the roles map, own keys only, so a role named `a.b` can be asked
  about through the library, while the command refuses a dotted role
  name because the entry paths it would report (`$.roles.a.b.deny.0`)
  could not be followed by `why`.
- **The `class` of an evaluation failure is `reference` whatever the
  code.** The report reuses `evalFailure` from `ts/src/query.ts`, whose
  `finding` helper hardcodes the class, and the generation-failure
  branch in `allow.ts` does the same, so a `scalar_kind` or `closed`
  failure of the role model reports as `[reference]`. `get` and `why`
  have the same trait; the class table in `ts/src/hints.ts` is the
  place a fix lands for all three, and it is not this note's.
- **No pattern beyond `*`.** No `**`, no alternation, no negation. A
  role that needs "every replicas anywhere" writes the levels out. The
  matcher is a prefix comparison because the pattern language is one
  character, and a richer one is a decision to take with evidence from
  role models as they are written.
- **The Go CLI does not have the verb.** The reference says so once,
  and the plan below removes the sentence.

## Implementation plan

Spec-first, as every shared behaviour lands: the rows before the port,
their expected values from the parity probe, nothing regressing.

**Phase 1 — the shared spec mode (S).** A five-column `allow` mode in
`test/spec/allow.tsv`: `name <TAB> allow <TAB> roles-src <TAB> ask
<TAB> expect`, where `ask` is `role` and the paths separated by
whitespace (`dev $.services.auth $.deploy.eu1.replicas`) and `expect`
is the report as JSON (`verdict`, `role`, `paths` with `path`,
`allowed`, `reason`, `by`, `pattern`), findings compared minus their
messages as `vet` compares them. Rows for every rule above: covered
below, uncovered above, deny at, deny above, deny below, `*` matching
one segment and not two, root allowed only by `$`, undeclared role,
a role with no `allow`, a closed vocabulary without `deny?`, a
malformed role, `--at` off the default. `ts/test/spec.test.ts` learns
the mode; the TypeScript rows are the ones `ts/test/allow.test.ts`
already asserts, moved rather than duplicated.

**Phase 2 — the Go port (M).** `go/allow.go`: `Allow(src, role,
paths, opts)` returning the same report, the shape met the same way
(parsed first, conjoined, unified once), the lists read from the tree,
`pathParts` shared with `go/query.go`. `go/cmd/aontu/
allow.go`: the verb, byte-identical text and JSON renderings, the same
exit table. `go/spec_test.go` runs `allow.tsv` with no skip list, and
`go/allow_test.go` covers the arms the rows cannot reach (ADR-002).
The sentence in `docs/reference-api.md` comes out, and this note's
status line changes in the same commit.

**Phase 3 — the MCP tool (S).** An `allow` tool in `ts/src/mcp.ts`
taking `roles` (source text), `role`, `paths` and `at`, returning the
JSON report with `isError: false` on a refusal, as the other gates do:
the report is the answer. Pinned by `ts/test/mcp.test.ts` beside `set`.

**Phase 4 — the stanza (S).** `aontu agentsmd` gains one line in its
"How to work with it" block, `aontu allow --role <role> roles.aontu
<example>`, so an agent that reads the stanza reads the gate; the
skill already carries the verb. Held by the `agentsmd` rows of
`test/spec/agentsmd.tsv` in both ports, whose expected stanza gains
the line.
