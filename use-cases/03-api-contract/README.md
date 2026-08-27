# Use case 03: a REST API contract as agent ground truth

## The scenario

A REST API contract for a project-management SaaS ("Nimbus Tasks"):
two entities (`User`, `Project`), four endpoints (list/create users,
get/create projects) with methods, paths, query shapes, request and
response bodies keyed by status code, and the single error envelope
every non-2xx response uses.

This is the document an AI coding agent codes against, and the
document it is *corrected by*: the agent emits a candidate request
body, `aontu vet` says what does not hold and where, the agent
repairs, and re-vets. That emit -> validate -> repair loop is aontu's
headline agent story, so this use case measures exactly that: **is a
vet finding good enough for an agent to repair from, mechanically,
without re-reading the schema?** It also asks what an OpenAPI-shaped
contract needs that the language does not have.

Enterprise stakes: an API contract is the highest-leverage single
ground truth an org has -- every client, server, SDK, and test suite
derives from it. If agents can be *held* to it cheaply, contract drift
(the classic integration failure mode) becomes a CI error instead of a
production incident.

## The model

| file | role | load-bearing features |
|---|---|---|
| `types.aon` | shared wire vocabulary (`$.types.*`) | `hide()`, `re()`, `min`/`max`, `length()`, enum disjunctions |
| `entities.aon` | `User`, `Project` | `close()`, optional `k?:`, refs |
| `errors.aon` | the error envelope | nested `close()`, inline list-spread template |
| `messages.aon` | request/query/page shapes -- the vet anchors | `close()`, refs, `[ &: $.entities.User ]` |
| `api.aon` | endpoint registry | `&:` spread as self-policing shape, `type()` marks, numeric status-code keys |
| `contract.aon` | entry point | `@"file"` includes |
| `user-page.aon` | root-anchored duplicate of `$.msg.UserPage` | workaround for gap 7 |
| `evolution/tighten-page-size.aon` | proposed v1.4 change | constraint meet (`max(100) & max(50)`) |
| `bad/new-endpoint-method.aon` | a `method: FETCH` endpoint | the registry spread refusing it |
| `repair.py` | the mechanical half of the agent loop | consumes `vet --format json` |
| `data/*.json` | agent-emitted candidates | one valid, wrong types, surplus/typo keys, subtly wrong, missing fields |

Run `./check.sh` (23 assertions, exit 0). Every claim below is pinned
by it.

## What worked

- **The vet loop closes, mechanically, in one round.** For bounded
  constraints the finding alone is a repair instruction:
  `expected: integer&min(1)&max(100)` / `actual: 500` -> `repair.py`
  clamps to 100, re-vet is green (check 14). Multiple findings arrive
  in one report, so one round fixes several defects.
- **Exit codes are verdict classes, and they mean what the docs say**:
  0 valid, 1 "repair what you emitted", 3 "something is missing", 4
  "the schema side is unusable" (`--at` typo). An agent can branch on
  the exit code before reading a byte of the report.
- **`close()` is the right default for wire messages.** Surplus and
  typo'd keys are conflicts, not silently-ignored extras -- the
  OpenAPI `additionalProperties:false` everyone forgets is one call
  here.
- **`--at` fragment anchors are precise**, work through `type()`
  marks and numeric status-code keys
  (`--at '$.api.create_user.responses.201'`, check 18), and a typo'd
  anchor gets `note: did you mean CreateUserRequest?` (check 13).
- **List-of-T actually validates arbitrary-length arrays** via
  `[ &: template ]`, with per-element findings -- something naive
  positional list unification would not give (checks 19, 21).
- **The contract polices itself.** The `&:` spread over the registry
  refused `method: FETCH` on a teammate's new endpoint with
  `[aontu/|:empty] ... "FETCH" ... "GET"|"POST"|"PATCH"|"DELETE"`
  (check 22) -- schema-for-the-schema with zero extra tooling.
- **`breaking` catches real API breaks across an include chain.**
  Capping `page_size` at 50 under the same major:
  `$.types.PageSize: compat_narrowed ... expected: integer&min(1)&max(50)
  actual: integer&min(1)&max(100)` (check 23).
- **Identity and onboarding come free**: `hash` gives a canon-pin that
  survives reformatting; `agentsmd contract.aon` emits a ready-made
  AGENTS.md stanza telling agents how to query the truth (check 5).
- **`--format sarif` is real SARIF 2.1.0** with the native finding
  embedded under `properties`, and the exit code still says invalid
  (check 17), so CI upload and loop-control coexist.
- **Better than documented:** `length()`, `unique()` and `must()` are
  live in the TS engine (the language reference still says they "parse
  as `unknown_function` errors"). `DisplayName: string &
  length(min(1) & max(80))` enforces, and `must()` findings carry the
  author's message as `note:`.
- **`why` provenance is correct across includes**
  (`$.msg.CreateUserRequest.email ... messages.aon:9:12 (ref)`) --
  which makes vet's misattribution (gap 3) look fixable.

## Gaps and friction

Severity: **critical** = defeats the scenario silently; **major** =
blocks or forces a structural workaround; **minor/polish** = friction.

### Gap 1 (critical): a missing required enum field vets as `valid` -- FIXED 2026-08-27

**Closed by [ADR-007](../../ADR.md).** A candidate that omits `role`
entirely -- required, `"admin" | "member" | "viewer"` -- used to pass.
It is now incomplete, the same answer and exit code a missing non-enum
field gets:

```
$ aontu vet --at '$.msg.CreateUserRequest' contract.aon data/create-user-missing-role.json
verdict: incomplete     # exit 3

$.msg.CreateUserRequest.role: disjunct_no_gen [incomplete]
```

The rest of this entry is the diagnosis as it stood.

Minimal repro: any required field whose residual contains a scalar
disjunction is silently satisfiable-by-absence, while `re()`/`string`
fields correctly report `mapval_required`:

```
# R: close({ a: string, b: "x" | "y" })       + {"a":"hi"}  -> valid (!)
# R: close({ a: string, b: string & ("x"|"y") })            -> valid (!)
# R: close({ a: string, b: re("^(x|y)$") })                 -> incomplete, exit 3
```

Every enum in a real API contract (role, status, visibility, error
code, HTTP method) was optional-in-practice. The only spelling that
enforced presence was a regex enum, which abandons the lattice-native
disjunction.

The root was a single line of generation: an unresolved disjunction's
surviving members were FOLDED together with unify and the result
emitted. That fold produced the misleading eval message too --
`Cannot unify value: "y" with value: "x"` under `[aontu/scalar_value]`,
as if the two alternatives conflicted with each other -- and, being a
*conflict*, it was filtered out by vet's incomplete-class pass, which
is why vet said nothing at all. Both surfaces now answer
`disjunct_no_gen`, class incomplete, naming the disjunction. Pinned by
check 11.

### Gap 2 (critical): `hide()`/`type()` anchors silently lose required-field checks

The idiomatic layout (definitions in a `hide()` block, vet with
`--at`) disables `mapval_required` entirely:

```
# T: hide({ S: re("^x") })
# msg: hide({ R: close({ a: string, b: $.T.S }) })   + {"a":"hi"}
$ aontu vet --at '$.msg.R' schema.aon data.json
verdict: valid          # exit 0 -- b missing, no finding

# same schema, msg NOT hidden:
verdict: incomplete
$.msg.R.b: mapval_required [incomplete]              # exit 3
```

`type()` behaves identically. Generation-visibility and
validation-strictness are coupled through one mark: anything kept out
of JSON output stops enforcing presence when vetted. There is no
"schema, but strict" marking. Consequence for this model: `msg`,
`entities`, `errors` must stay unmarked, so **the contract file itself
no longer evaluates to JSON** (`aontu contract.aon` exits 1); the
inventory has to come from `get '$.api'` and `--canon` instead
(checks 1-3 pin the trade). Conflict findings (wrong values) are
unaffected -- which makes the hole easy to ship without noticing.

### Gap 3 (major): schema sites are misattributed across `@` includes

The finding for a missing `name` names the *entry* file with the
*included* file's coordinates -- `contract.aon` is 19 lines long and
`DisplayName` lives in `types.aon:29`:

```
$.msg.CreateUserRequest.name: mapval_required [incomplete]
  schema: contract.aon:29:25 (string&length(integer&min(1)&max(80)))
```

The human renderer has the inverse bug -- correct label, snippet drawn
from the entry file (this is `errors.aon`'s enum with `contract.aon`'s
comment lines under it):

```
 Cannot unify value: "unauthorized" with value: "invalid_request"
  --> errors.aon:7:33
  5 | # fields (README, gap 2), and unmarked abstract values block whole-file
  6 | # generation. The working views are --canon, hash, get '$.api', and
  7 | # vet --at '$.msg.<Message>' contract.aon <candidate.json>.
                                      ^ value was: "unauthorized"
```

A repair agent that follows the site edits the wrong file. Any
contract big enough to matter is multi-file, so this bites
immediately. (`why` gets the same attribution right, so the data
exists.) Pinned structurally by check 10.

### Gap 4 (major): finding paths are inconsistent about the `--at` anchor

Constraint findings keep the anchor prefix; `closed` findings drop it:

```
$.msg.CreateUserRequest.email: constraint [conflict]   # anchored
$.emial: closed [conflict]                             # not anchored
```

`repair.py` has to accept both spellings (`rel_segments()`). Harmless
to a human, a real tax on automation. Pinned by check 12.

### Gap 5 (major): the portable regex subset cannot say "optional fractional seconds" -- and blames the data

The natural RFC 3339 pattern is refused at *match* time, as a
*conflict*, with the pattern text replaced by `constraint()`:

```
# Timestamp: re("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$")
$ aontu vet --at '$.A' pat.aon good-timestamp.json
verdict: invalid        # exit 1 -- the DATA is blamed
$.A.t: constraint_pattern [conflict]
  schema: pat.aon:1:15 (constraint())
```

Bisection: a **quantified group may not contain a quantifier** --
`(\.\d+)?`, `(0+)?`, `([0-9]+)?`, `(\.\d{1,9})?` all refuse; `(\d)?`,
`\d+`, `(x\d)?` are fine. The reference's subset table ("grouping
`(...)`", "repetition ... `{n,m}`") does not state this restriction.
Three separate problems: (a) an ISO-8601 timestamp -- day one of any
API contract -- needs the workaround `(Z|\.\d{3}Z)` (unquantified
alternation group, fractional seconds frozen at 3 digits; live in
`types.aon`); (b) the verdict should be `error` (exit 4, "the schema
side is unusable"), not `invalid` -- valid data gets bounced; (c) the
finding neither shows the pattern nor names the offending construct,
so the schema author gets `constraint()` and a shrug.

### Gap 6 (major): only `constraint` findings carry `expected`/`actual` -- and `closed` findings carry nothing at all

The repair-quality ledger, from `--format json`:

| finding | `expected`/`actual` | admissible alternatives | nearest-key note |
|---|---|---|---|
| `constraint` (bounds, `re`, `length`) | yes | n/a | n/a |
| `\|:empty` (enum) | **no** | only inside `sites[role=schema].value` | no |
| `no_scalar_unify` (kind) | **no** | site value only | n/a |
| `closed` (surplus key) | **no** | **none** | **none** |

The enum finding for `"sort": "namez"`:

```json
{ "code": "|:empty",
  "path": "$.msg.ListUsersQuery.sort",
  "sites": [
    { "role": "data",   "value": "\"namez\"", ... },
    { "role": "schema", "value": "\"name\"|\"-name\"|\"created_at\"|\"-created_at\"",
      "file": "contract.aon", "row": -1, "col": -1, ... } ] }
```

The alternatives are there, but as an unparsed canon string in a site
field, unranked. The `closed` finding for the typo'd key `emial` is
the worst case -- this is everything the agent gets:

```
$.emial: closed [conflict]
  [aontu/closed]: Cannot resolve value at path $.emial
  data: data/create-user-surplus.json:2:12 ("alan.turing@example.com")
```

No declared-key list, no "did you mean email?" -- even though the CLI
demonstrably has the machinery: a typo in `--at` itself answers
`note: did you mean CreateUserRequest?`. The agent must run
`aontu get --keys` and do its own Levenshtein (that is what
`repair.py` does, and checks 12/13/15 pin the asymmetry). For the
headline agent story, key-typo-against-`close()` is *the* most common
LLM emission defect; it gets the least helpful finding in the report.

### Gap 7 (major): a `$.ref` inside a list spread fails under `vet --at`

The DRY page schema cannot be vetted at its anchor:

```
# msg: { UserPage: close({ items: [ &: $.entities.User ], ... }) }
$ aontu vet --at '$.msg.UserPage' contract.aon data/user-page-ok.json
verdict: invalid
$.items.0.responses.200: no_path [reference]
  [aontu/no_path]: Cannot resolve value at path $.items.0.responses.200
  schema: contract.aon:37:21 ($.entities.User)
```

(Note the garbled path mixing `items.0` with another endpoint's
`responses.200`.) Plain refs under `--at` resolve fine, including refs
pointing outside the anchor; only ref-in-list-spread breaks.
Workarounds, both used here: inline the element template (fine for the
small `details` list in `errors.aon`, unacceptable for `User`), or a
root-anchored one-file-per-message schema vetted *without* `--at`
(`user-page.aon` -- which duplicates the four page fields and cannot
`close()` the document root, so surplus top-level keys pass there).
Pinned by checks 19-21. Combined with gap 2, the layout advice
becomes awkward: root-anchored per-message files are the only shape
where *every* verdict class works.

### Gap 8 (major): list findings point at the wrong element

`data/user-page-bad.json` breaks the email of `items[1]`; the finding
says `items.0` while the source coordinates correctly point at row 13
(element 1):

```
$.items.0.email: constraint [conflict]
  ...
  data: data/user-page-bad.json:13:16 ("grace.hopper@")
```

An agent repairing by path (the natural JSON-pointer move) edits the
healthy element. Repairing by row/col is right but means re-parsing
the document positionally. Pinned by check 21. (2026-08-26: unchanged
by the template-clone isolation change, ADR-005 — this is a TS-only
attribution defect: the Go port answers `items.1`. Site-attribution
family, still open. Related cosmetic form: a bad element against an
inline spread reports a doubled index, `$.tags.1.0`.)

### Gap 9 (minor): enum findings have no schema location -- FIXED 2026-08-27

Every `|:empty` schema site was `-1:-1`: the alternatives were printed
but the agent could not jump to where the enum is defined. The meet
mints a fresh disjunction, which arrived unsited; a narrowed
disjunction now carries the site of the one it came from, so the
finding names `contract.aon:35:15`. Pinned by check 9.

### Gap 10 (major): `&:` spreads make evolution checks undecidable -- a contract is not self-compatible

```
$ aontu breaking --against contract.aon contract.aon
verdict: undecided      # exit 3, on a byte-identical document
$.msg.UserPage.items: sub_path_dependent_spread [compat]
  a path-dependent spread template cannot be compared structurally
  expected: $.entities.User
  actual:   $.entities.User
$.api.&: sub_unresolved [compat]
  unresolved residue: the admitted set is not comparable
  expected: close({"auth":"bearer"|"none",...})
  actual:   close({"auth":"bearer"|"none",...})   # textually identical
```

Honest indecision is the documented design ("soundness before
completeness"), but the practical effect is that any contract using
the two idioms this use case is built on (list-of-T, self-policing
registry) can never earn `compatible`: a CI gate must run
`--allow-undecided`, which then waives real regressions in exactly
those subtrees. A textual-identity (or canon-hash-per-subtree)
fast-path would fix the reflexive case for free. Pinned by check 23.

### Gap 11 (polish): `breaking` rejects the global trust options

```
$ aontu breaking --against contract.aon --include-root . evolution/tighten-page-size.aon
aontu: unknown breaking option --include-root (try --help)   # exit 2
```

Meanwhile every evaluation of `evolution/tighten-page-size.aon` (which
includes `../contract.aon`) prints `aontu: warning: include resolved
outside the entry root ... (a future release will deny this by
default; pass --trust system to keep it ...)` -- advice the verb
refuses to accept. When the default flips, cross-directory evolution
checks may have no escape hatch.

### Gap 12 (major, scenario-level): no OpenAPI / JSON Schema export

Confirmed absent: the CLI usage lists
`vet subsume breaking trim relations hash mod get why set agentsmd`
-- no export/convert verb -- and
`grep -rin 'openapi\|json.schema' docs/*.md` matches nothing. The
canon form is a fine *internal* ground truth (stable, hashable,
constraint-preserving), but an API contract's consumers live on
OpenAPI: client generators, gateway config, docs portals, mock
servers. Without an exporter the aontu contract cannot *replace* the
OpenAPI file, so an enterprise team would have to maintain both and
keep them in sync by hand -- precisely the drift problem the ground
truth was supposed to end. Most of the mapping is mechanical (close ->
additionalProperties:false, enums -> `enum`, `re` -> `pattern`,
min/max -> minimum/maximum, `k?:` -> required list); the residual
mismatches (preferences, `must()`) could export as `x-aontu-*`
extensions.

### Gap 13 (minor): `type()`-marked values vanish wholesale from the inventory

`get '$.api.create_user'` prints `"responses": {}` -- the status-code
keys (201/400/409) are invisible because each *value* is type-marked,
yet the empty parent map remains. The codes are real and reachable
(`get --keys '$.api.create_user.responses'` lists them; check 4), but
the JSON view of "which status codes exist" -- the first thing an
agent wants -- is an empty object. A keys-only rendering of marked
children would fix it.

### Gap 14 (docs): the constraint-atom status note is stale

`docs/reference-language.md` says `length`, `unique` and `must` "still
parse as `unknown_function` errors"; all three enforce in the TS
engine (this model relies on `length()` for `DisplayName`,
`summary`, `message`). Pleasant surprise, but an agent that trusts the
reference will avoid three working features -- for a language whose
pitch is being the thing agents can trust, the reference drifting from
the engine is its own kind of contract violation.

## Verdict on the headline question

Can an agent self-repair from vet findings? **For value defects, yes
-- demonstrably, in one round** (checks 14-15: clamp from `expected`,
enum from the schema site, and the loop re-vets green). For *shape*
defects the report still under-delivers: key typos get no candidates
(gap 6), list findings point at the wrong element (gap 8), and the
schema-side coordinates cannot be trusted across includes (gap 3). The
machinery for all three fixes visibly exists elsewhere in the tool
(did-you-mean, `get --keys`, correct `why` sites); it has not been
wired into the one report the agent loop consumes.

**2026-08-27**: two of the five are closed. A missing enum field is no
longer silence (gap 1, ADR-007) and enum findings now carry a schema
location (gap 9), so the repair loop's enum branch has both a verdict
and somewhere to jump to.
