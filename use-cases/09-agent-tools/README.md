# 09 — An AI agent platform's tool registry as ground truth

## The scenario

An agent platform ("Orion") runs a fleet of LLM agents that call
tools. The platform needs ONE document that answers, for every tool:
what exists, what arguments a call may carry (and must refuse), what a
call can cost (side-effect class, rate limit, timeout), and who may
call it. Today this truth is usually scattered across a TypeScript
tool file, a JSON Schema, a wiki page and the dispatcher's `if`
statements — and those copies drift. This is aontu's home turf: the
MCP ecosystem's tool-definition problem.

The model exercises the full loop:

1. `registry.aon` — the registry itself: six tools, closed schemas,
   constraint atoms, enums, generated call schemas, derived fields, a
   derived docs table.
2. `guard.aon` — the dispatcher's vet entrypoint (see gap 7 for why it
   exists as a separate file).
3. `data/call-*.json` — agent-emitted calls `{tool, arguments}`,
   vetted with `aontu vet --at $.guard.<tool>` — the runtime
   guardrail, asserted by exit code and error code in `check.sh`.
4. The real `aontu-mcp` server driven over stdio JSON-RPC
   (initialize, tools/list, tools/call of vet) from `check.sh`.
5. `aontu agentsmd` output, assessed below.

`./check.sh` runs everything and asserts every outcome (19 checks).

## How the model is designed

- **`argschemas` is the spine.** The set of tool names is the key set
  of one closed map. `tools` (metadata) is `close(pack($.argschemas,
  $.ToolSpec))`, so metadata for a tool with no argument schema is a
  located `[aontu/closed]` error (`bad/rogue-tool.aon`), and an
  argument schema with no metadata leaves required `ToolSpec` fields
  unresolved and the registry refuses to generate. Both drift
  directions die at review time, from one `pack`.
- **The wire schema is generated, not written.** `guard: pack(
  $.argschemas, close({tool: key(), arguments: _}))` makes the
  `{tool, arguments}` envelope per tool; `close()` survives the `_`
  clone, so a hallucinated argument is `[aontu/closed]`.
- **Constraint atoms are the guardrail vocabulary**: `re()` for URL /
  email / id shapes, `min`/`max` bounds, `length()` on strings,
  `unique()` on lists, enum disjunctions for `method`, `priority`,
  `scope`, `side_effect`.
- **`type()` marks** keep every schema out of the generated JSON while
  it still constrains: `aontu registry.aon` emits only the concrete
  registry (tools, docs) — the golden in `expected/registry.json`.
- **Derived truth**: `requires_approval: match(.side_effect,
  destructive, true, false)` per tool, and a markdown docs table
  computed from the tool entries. `aontu why` traces the flag back to
  the `match()` rule.
- **`deprecate()`** sunsets `http_request.max_redirects`: still
  admitted, warned on, with the replacement path in the warning.
- **Deliberate absences**: no `*` defaults anywhere near enforcement
  (gap 1), and `dry_run: boolean` required-and-explicit on
  `delete_records` for the same reason.

## What worked

- **The vet quadrachotomy is exactly a dispatcher's decision table.**
  valid(0) → dispatch; invalid(1) → refuse, feed findings back to the
  agent; incomplete(3) → ask for the missing argument; error(4) →
  unknown tool. All four states fall out of one command,
  `aontu vet --at "$.guard.$tool" guard.aon call.json`, with no
  per-tool code. The findings carry `expected`, `actual`, and both
  sites (schema file:line:col AND data file:line:col) — better repair
  material than most JSON Schema validators emit, and `--format
  json` / `--format sarif` both work.

  ```
  $.guard.http_request.url: constraint [conflict]
    [aontu/constraint]: Cannot unify values at path $.guard.http_request.url
    expected: re("^https://")&length(integer&min(0)&max(2048))
    actual:   "http://169.254.169.254/latest/meta-data/"
    data: data/call-http-bad.json:4:12 ("http://169.254.169.254/latest/meta-data/")
    schema: guard.aon:69:19 (re("^https://")&length(integer&min(0)&max(2048)))
  $.guard.http_request.method: |:empty [conflict]
    ...
    data: data/call-http-bad.json:5:15 ("DELETE")
    schema: guard.aon:-1:-1 ("GET"|"HEAD")
  ```

- **`close()` travels.** Sealed argument maps stay sealed through the
  `pack` clone (`_`), so the hallucinated `cascade` argument on
  `delete_records` is refused with a located `[aontu/closed]` — the
  single most important guardrail for LLM-emitted calls, and it costs
  one wrapping call in the schema.
- **The pack spine genuinely prevents drift.** Registering
  `audit_log` metadata without an argument schema:
  `[aontu/closed]: Cannot resolve value at path $.tools.audit_log`.
  Contradicting a published rate limit:
  `[aontu/scalar_value]: Cannot unify values at path
  $.tools.search_docs.rate_limit.per_minute`.
- **`length`, `unique` and `must` are implemented**, although
  `docs/reference-language.md` still says they "parse as
  `unknown_function` errors". They work in direct evaluation
  (`length(1) & "𝄞"` holds; duplicate list members are refused) —
  but see gap 8 for a vet-mode hole.
- **`deprecate()` is a real sunsetting mechanism**: the deprecated
  call vets `valid` (exit 0) with
  `deprecated: renamed (use $.argschemas.http_request.redirects)
  (since 1.4.0)` in the report — exactly the migrate-without-breaking
  signal a platform wants (but see gap 15).
- **`why` explains derived truth**:
  `$.tools.delete_records.requires_approval = true` /
  `1. match(.side_effect,"destructive",true,false)
  registry.aon:171:22`.
- **`subsume` catches registry narrowing with a witness** (CLI only —
  gap 11): tightening `limit` from `max(50)` to `max(40)` answers
  `does_not_subsume` with `compat_narrowed`, `expected:
  integer&min(1)&max(40)`, `actual: integer&min(1)&max(50)`, both
  file:line sites. This is the schema-evolution gate MCP registries
  do not have today.
- **The MCP server is protocol-correct and fast enough.** Initialize
  handshake, `tools/list`, `tools/call` of vet all behave; a refusal
  is the report with `isError: false`, which is the right contract
  for an agent (the report IS the answer).
- **Latency is acceptable.** One run on this machine:
  - warm (one `aontu-mcp` process): `LATENCY 100 vets in 2876ms,
    28.8ms/call` — fine as a pre-dispatch guardrail.
  - cold (CLI spawn per call): `CLI LATENCY: 20 vets in 3973ms,
    198ms/call` — usable in CI, too slow to spawn per agent call;
    hold the server open.
- **`agentsmd` + `hash`**: the stanza's pin is byte-identical to
  `aontu hash registry.aon` (asserted in check.sh), so an agent can
  cheaply detect that the truth changed.

## Gaps and friction

Numbered; the numbers are referenced from comments in the `.aon`
files. Severities are my honest read for THIS use case.

### Gap 1 (critical): a `*` default silently disables the constraint it is written with

> **2026-08-26: fixed by the preference admission gate (ADR-004).**
> The disjunct form now enforces on override — `a: *10 | integer &
> min(1) & max(50)` refuses `500` with `[aontu/|:empty]`, and
> `*readonly | write | destructive` refuses `bogus` — exactly the
> "test the surviving disjunct" gate this gap asked for. The conjunct
> form's lost default below remains the phase-1 limit. No assertions
> in this case pinned the old behaviour; the record below is kept
> as written.

The documented idiom for "default plus range" — the reference itself
says *"use the disjunct form (`*8080 | min(1024)`) today"* — admitted
**any** value of the default's kind, because a same-kind override
replaced the preferred branch without consulting the others:

```
$ cat tA.aon
a: *10 | integer & min(1) & max(50)
a: 500
$ aontu tA.aon
{
  "a": 500
}
```

Enums with defaults are not enums at all:

```
$ printf 'a: *readonly | write | destructive\na: bogus\n' | aontu
{
  "a": "bogus"
}
```

And the conjunct form enforces but never defaults, so there is
currently **no way to have both**:

```
$ printf 'a: min(1) & max(50) & *10\na: 500\n' > tC.aon ; aontu tC.aon
[aontu/constraint]: Cannot unify values at path $.a        # good
$ printf 'a: min(1) & max(50) & *10\n' > tD.aon ; aontu tD.aon
[aontu/mapval_no_gen]: Cannot resolve value at path $.a
 Cannot resolve value: integer&min(1)&max(50)              # default lost
```

**Workaround used**: no `*` defaults anywhere enforcement matters;
optional keys carry constraints only, and the dispatcher owns runtime
defaults. For a tool registry that is the right call anyway, but the
language offers a footgun (`*10 | min(1) & max(50)`) that looks like
the safe thing and is not. This should be a headline warning, or the
pref-override gate should test the surviving disjunct.

### Gap 2 (major): a pack template cannot compute from the child's own fields

The reference says *"key() and relative references inside the template
answer for the child"*. Relative references do not:

```
tools: pack($.names, {
  side_effect: string
  doc_row: "| " + key() + " | " + .side_effect + " |"
})
```
```
[aontu/no_path]: Cannot resolve value at path $.tools.NaN.doc_row
 Cannot resolve value: .side_effect
```

(Note the `NaN` path segment.) The identical construction in a plain
map works. This blocks the natural way to derive per-tool rows,
approval flags, or any projection — the docs-table half of this
exercise. **Workaround used**: `requires_approval` and the docs table
are written per tool with absolute paths (six repetitions each).

### Gap 3 (major): spread templates have the same blindness

```
rows: { &: { md: "| " + .$KEY + " | " + .side_effect + " |" }
  a: { side_effect: readonly } }
```
```
[aontu/no_path]: Cannot resolve value at path $.rows.md
 Cannot resolve value: .side_effect
```

and the cross-statement form fails differently:

```
[aontu/mapval_spread_required]: Cannot unify values at path $.rows.a
The value for key md is required (defined in spread).
 Cannot unify value: "| "+key()+" | "+.side_effect+" |" with value: nil
```

`.$KEY` works in a spread; sibling references do not. Between gaps 2
and 3 there is no template-level projection at all — the G8 combinator
work these presumably wait on is the single biggest expressiveness
hole this use case hit.

### Gap 4 (major): referencing a computed, hidden field of a pack child is silently dropped

```
names: type(close({ a: close({q: string}) }))
tools: close(pack($.names, { se: string, doc_row: string }))
tools: a: { se: readonly, doc_row: hide("| " + .se + " |") }
docs: [ copy($.tools.a.doc_row) ]
```

evaluates with exit 0 and `"docs": []` — the element vanishes with no
error. Remove the `pack` (a literal `tools:` map) and the same source
yields `"docs": ["| readonly |"]`. Silent loss is worse than a
refusal in a ground-truth system. **Workaround used**: the docs table
computes from unhidden concrete fields with absolute paths.

### Gap 5 (major): `length(min(n))` cannot coexist with a list spread template

"At least one role" / "at least one record id" is a natural registry
constraint. It refuses at schema-composition time, against the
schema's own zero-element templated list:

```
[aontu/constraint]: Cannot unify values at path $.spec.ToolSpec.allowed_roles
 Cannot unify value: length(integer&min(1)) with value: [&:$.spec.Role]
```

`length(max(n))` and `unique()` compose fine (in one-document
evaluation — see gap 8). **Workaround**: minimum sizes are simply not
stated; a comment records the intent.

### Gap 6 (minor): a reference into a `type()`-marked map from inside that map never resolves

The natural layout — one `spec: type({Role: ..., ToolSpec: {...
side_effect: $.spec.Role ...}})` — deadlocks: the `type()` call waits
for its argument, the argument waits for `$.spec.SideEffect`, which
waits for the `type()` call:

```
[aontu/mapval_no_gen]: Cannot resolve value at path $.spec
 Cannot resolve value: type({"SE":"readonly"|"write","TS":close({"side_effect":$.spec.SE})})
```

The failure is at generation, far from the cause, and nothing names
the cycle. Oddly, a *list-spread* self-reference (`[&: $.spec.Role]`)
is tolerated. **Workaround used**: `Role`, `SideEffect`, `ToolSpec`
are separate top-level `type()`-marked fields.

### Gap 7 (critical): a `type()` mark above the vet anchor silently drops required-key enforcement

The same argument schema, the same data (`{ "limit": 3 }`, required
`query` missing), one anchor under a `type()` mark and one not:

```
$ aontu vet --at '$.argschemas.search_docs' registry.aon /tmp/sargs.json
verdict: valid                 # exit 0 — the guardrail is GONE

$ aontu vet --at '$.guard.search_docs.arguments' guard.aon /tmp/sargs.json
verdict: incomplete            # exit 3 — correct (unmarked anchor)

$.guard.search_docs.query: mapval_required [incomplete]
  [aontu/mapval_required]: Cannot resolve value at path $.guard.search_docs.query
  schema: guard.aon:58:21 (string&length(integer&min(1)&max(256)))
```

Constraint and closed violations are still caught at a marked anchor;
only `mapval_required` findings disappear — the nastiest possible
failure mode, because every test that pokes it with *wrong* values
passes. `copy()` does not restore the force. This is why the model
needs two files: `registry.aon` must mark its schemas to generate
clean JSON, so the vet entrypoint (`guard:`, unmarked, re-packed from
the marked `argschemas` — which is fine) lives in `guard.aon`. The
interaction deserves either a fix or a loud vet warning ("anchor is
inside a type-marked subtree").

### Gap 8 (major): list sizing atoms are not re-checked against data in vet

`labels: [&: ...] & length(max(10)) & unique()` in the schema; a call
with `"labels": ["egress", "egress"]` (or 11 labels):

```
$ aontu vet --at '$.guard.create_ticket' guard.aon data/call-ticket-dup-labels.json
verdict: valid
```

In one-document evaluation the same atoms DO refuse (`[aontu/constraint]`).
The schema settles alone first under vet, the atoms fold against the
empty templated list, and canon shows them already stripped:

```
"record_ids":[&:string&re("^rec_[0-9a-f]{8}$")]     # length/unique gone
```

So every list-sizing constraint in this registry is decorative at the
exact moment it matters (vetting agent calls). `check.sh` pins the
hole (`ok 11`) so its fix will be noticed. Element-level constraints
in the spread (`re()` on each label) still work.

### Gap 9 (minor): bidirectional consistency packs are a refused cycle

`argschemas: pack($.tools, {})` plus `tools: pack($.argschemas, {})`
— each direction alone is a lovely drift check — is
`[aontu/unify_cycle]: Circular reference detected`. Defensible
semantics, but the error names neither generator. The spine design
(`tools` packed FROM `argschemas`) gets both directions with one
pack, and is the better model anyway.

### Gap 10 (minor): the language reference undersells the engine

`docs/reference-language.md` states `length`, `unique` and `must`
"still parse as `unknown_function` errors". All three evaluate today
(`must(min(1),"msg") & 5` → `5`). For a document that positions
itself as ground truth, its own drift is worth calling out.

### Gap 11 (major): the MCP surface is a read-only subset of the CLI

Verified from `tools/list` (asserted against
`expected/mcp-tools.json`):

```
TOOLS ["vet","get","why","diff","canon","summary"]
```

Missing relative to the CLI: `subsume`, `breaking`, `relations`,
`hash`, `set`, `trim`, and plain evaluate/generate. Concretely for
this scenario: an agent connected to `aontu-mcp` can vet a call but
cannot ask "is my proposed registry change breaking?" — the exact
question the `subsume` demo above answers in one CLI call — nor even
obtain the generated JSON of a document (`get` with path `$` covers
some of it). `summary`+`get` is a good progressive-disclosure pair;
the evolution verbs are the ones an agent platform would miss first.

### Gap 12 (major): no JSON Schema export — the MCP interop wall

MCP clients require `inputSchema` in JSON Schema. Aontu has no
converter: no CLI verb, no MCP tool, no docs mention (`grep -ric
"json schema" docs/*.md` → nothing). The irony is sharp: aontu's own
MCP server hand-writes JSON Schema for its six tools
(`ts/src/mcp.ts`), while sitting on a schema language that cannot
emit it. A platform adopting this registry must therefore either
(a) hand-maintain a JSON Schema per tool beside `argschemas` —
reintroducing the drift the registry exists to kill; (b) write a
`canon`-to-JSON-Schema converter (the canon of an argschema —
`{"query":string&length(...),"limit"?:integer&min(1)&max(50)}` — is
regular enough that closed maps, `?`, enum disjunctions, `min`/`max`,
`re` and `length` all have direct JSON Schema images; `match`,
references and `must` do not); or (c) skip client-side schemas and
route every call through a vet-before-dispatch proxy, which is what
this use case's `guard.aon` flow amounts to. (c) works but forfeits
client-side elicitation and IDE hints. A `aontu jsonschema <path>
<file>` verb exporting the subset, refusing loudly on the
non-representable remainder, would close the single biggest adoption
gap for the MCP ecosystem.

### Gap 13 (minor): the agentsmd stanza would not teach an unfamiliar LLM enough

Verbatim output of `aontu agentsmd registry.aon` (this is also what
`check.sh` asserts the pin from):

```
<!-- aontu:begin -->
## Ground truth: `registry.aon`

The values below are DERIVED from `registry.aon`, an Aontu
definition. Do not restate them here — read them from the source,
which is the only copy that cannot go stale.

- Pin: `aon1-kR7u_dMSkHOp9F_97kBjbu_qUK_kz20Xb0pXBhWeOTI`
  (the canon-hash: it survives reformatting and moves on any
  change of meaning — `aontu hash registry.aon` re-derives it)
- Top-level keys: `Role`, `SideEffect`, `ToolSpec`, `argschemas`, `docs`, `registry`, `tools`
- Shape: `{"Role":string|string|string|string,"SideEffect":string|string|string,"ToolSpec":{"allowed_roles":top,"description":top,"owner":top,"rate_limit":top,"requires_approval":top,"side_effect":top,"timeout_ms":top},"argschemas":{"create_ticket":top,"delete_records":top,"http_request":top,"read_file":top,"search_docs":top,"send_email":top},"docs":{"header":top,"table":top},"registry":{"owner":top,"platform":top,"version":top},"tools":{"create_ticket":top,"delete_records":top,"http_request":top,"read_file":top,"search_docs":top,"send_email":top}}`

How to work with it:

```
# what does it say at a path?
aontu get $.Role registry.aon

# why does that value hold?
aontu why $.Role registry.aon

# does my document satisfy it?
aontu vet registry.aon mine.aon

# change it without editing it
aontu set $.Role=<value> --entry registry.aon --overlay overlay.aon
```

Regenerate this section with `aontu agentsmd registry.aon`.
<!-- aontu:end -->
```

Honest assessment: the pin, the key list and the verb menu are
genuinely useful — an agent learns where truth lives, that it is
derivable, and how to query it. But:

- `"Role":string|string|string|string` destroys the one thing worth
  showing (the enum's values; canon renders them fine as
  `"admin"|"operator"|"analyst"|"agent"`).
- The shape is depth-1 `top` everywhere, so nothing distinguishes a
  tool entry from a docs row.
- The example command it teaches **fails on its own document**:
  `aontu get $.Role registry.aon` → `$.Role: scalar_value
  [reference]`, exit 4, because a type-marked disjunction has no JSON
  view (`get --canon` works). An LLM following the stanza verbatim
  hits an error on its first query.

An unfamiliar LLM would find the file; it would not learn how to
CALL a tool from this. It needs the `get`/`summary` follow-ups —
which is the stated design ("progressive disclosure"), but the
first-tier examples should at least run.

### Gap 14 (major): `match()` on a defaulted scrutinee takes the first admissible arm, not the default

> **2026-08-26: fixed by the defaulted-scrutinee rule (ADR-004).**
> A settled scrutinee carrying an effective default now matches as the
> value generation will emit, so the example below answers
> `requires_approval: false` when `side_effect` is unset and `true`
> only when it is genuinely `destructive`. Pinned by
> `test/spec/gen-match.tsv` (`match-defaulted-scrutinee-*`).

```
tool: {
  side_effect: *readonly | write | destructive
  requires_approval: match(.side_effect, destructive, true, false)
}
```

generated `side_effect: "readonly"` with `requires_approval: true` —
the `destructive` pattern unified with the still-open disjunction, so
the derivation contradicted the generated value it derives from.
Combined with gap 1's "no defaults near enforcement" rule this cost
nothing here (every `side_effect` is explicit), but it was a silent
wrong answer waiting for any model that keeps defaults.

### Gap 15 (minor): the deprecation warning fires without a point of use

Any vet touching `http_request` reports the deprecation even when the
call never sent `max_redirects` — here the data is `{ "method": "GET" }`:

```
$ aontu vet --at '$.guard.http_request.arguments' guard.aon /tmp/hargs.json
verdict: incomplete

$.guard.http_request.url: mapval_required [incomplete]
  ...
$.max_redirects: deprecated [compat]
  deprecated: renamed (use $.argschemas.http_request.redirects) (since 1.4.0)
  schema: guard.aon:73:21 (integer&min(0)&max(10))
```

Agents will be told to migrate an argument they did not use. When the
call does use it, the site correctly points at the data instead.

### Gap 16 (polish): finding paths mix frames

In one report: `$.guard.http_request.url` (schema frame, and note the
missing `arguments` segment) next to `$.arguments.cascade` and
`$.max_redirects` (data frame). A repair agent keying on paths has to
normalise them first.

## Verdict

The core loop — closed generated schemas, one vet command with
dispatcher-grade exit codes, dual-site findings, warm ~29ms calls
through the real MCP server — is genuinely better than the JSON
Schema + custom middleware status quo, and the pack-spine drift
protection has no equivalent there at all. Three things keep it from
being adoptable as-is for an MCP platform: the `*`-default soundness
hole (gap 1), the mark/vet and sizing-atom enforcement holes (gaps 7
and 8) — both of which fail *open* — and the missing JSON Schema
bridge (gap 12), which is the wall between this registry and every
existing MCP client.
