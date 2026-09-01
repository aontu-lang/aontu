# 09 — An AI agent platform's tool registry as ground truth

## The scenario

An agent platform ("Orion") runs a fleet of LLM agents that call
tools. The platform needs ONE document that answers, for every tool:
what exists, what arguments a call may carry (and must refuse), what a
call can cost (side-effect class, rate limit, timeout), and who may
call it. Today this truth is usually scattered across a TypeScript
tool file, a JSON Schema, a wiki page and the dispatcher's `if`
statements — and those copies drift. This is Aontu's home turf: the
MCP ecosystem's tool-definition problem.

The model exercises the full loop:

1. `registry.aon` — the registry itself: six tools, closed schemas,
   constraint atoms, enums, generated call schemas, derived fields, a
   derived docs table.
2. `guard.aon` — the dispatcher's vet entrypoint: one wire schema per
   tool, generated from the registry's argument schemas.
3. `data/call-*.json` — agent-emitted calls `{tool, arguments}`,
   vetted with `aontu vet --at $.guard.<tool>`: the runtime
   guardrail, asserted by exit code and error code in `check.sh`.
4. The real `aontu-mcp` server driven over stdio JSON-RPC
   (initialize, tools/list, tools/call of vet) from `check.sh`.
5. The `aontu agentsmd` stanza and its `aontu hash` pin.

`./check.sh` runs everything and asserts every outcome (19 checks).

## How the model is designed

- **`argschemas` is the spine.** The set of tool names is the key set
  of one closed map. `tools` (metadata) is `close(pack($.argschemas,
  $.ToolSpec))`, so metadata for a tool with no argument schema is a
  located `[aontu/closed]` error (`bad/rogue-tool.aon`), and an
  argument schema with no metadata leaves required `ToolSpec` fields
  unresolved and the registry refuses to generate. Both drift
  directions are refused the moment the registry is evaluated, from
  one `pack`.
- **The wire schema is generated, not written.** `guard: pack(
  $.argschemas, close({tool: key(), arguments: _}))` makes the
  `{tool, arguments}` envelope per tool; `close()` survives the `_`
  clone, so a hallucinated argument is `[aontu/closed]`. The guard
  lives in its own file, `guard.aon`, which includes `registry.aon`:
  `aontu registry.aon` emits only the concrete registry, and
  `aontu vet --at $.guard.<tool> guard.aon call.json` is the
  dispatcher's one command.
- **Constraint atoms are the guardrail vocabulary**: `re()` for URL /
  email / id shapes, `min`/`max` bounds, `length()` on strings,
  `length(max(n))` and `unique()` on lists, enum disjunctions for
  `method`, `priority`, `scope`, `side_effect`. A `length(min(n))`
  written on a templated list (`[&: ...]`) refuses at composition, so
  "at least one" is a dispatcher rule rather than a schema one.
- **`type()` marks** keep every schema out of the generated JSON while
  it still constrains: `aontu registry.aon` emits only the concrete
  registry (tools, docs) — the golden in `expected/registry.json`.
  `Role`, `SideEffect` and `ToolSpec` are separate top-level marked
  fields, each referenced by absolute path.
- **Derived truth**: `requires_approval: match(.side_effect,
  destructive, true, false)` per tool, and a markdown docs table
  computed from the tool entries. The rule and the table rows are
  written once per tool, each naming its tool by absolute path.
  `aontu why` traces the flag back to the `match()` rule.
- **`deprecate()`** sunsets `http_request.max_redirects`: still
  admitted, warned on, with the replacement path in the warning.
- **No defaults near enforcement.** Optional arguments carry
  constraints but no `*` defaults, so the dispatcher owns runtime
  defaults and the schema owns the admissible range; `dry_run:
  boolean` is required and explicit on `delete_records`, so
  destruction says what it means.
- **The vet verdict is the dispatcher's decision table.** valid (exit
  0) dispatches; invalid (1) refuses and feeds the findings back to
  the agent; incomplete (3) asks for the missing argument; error (4)
  is an unknown tool. All four states fall out of one command,
  `aontu vet --at "$.guard.$tool" guard.aon call.json`, with no
  per-tool code. The findings carry `expected`, `actual`, and both
  sites (schema file:line:col and data file:line:col), and
  `--format json` / `--format sarif` render the same report for
  machines. The two conflict findings for the cleartext URL call:

  ```
  $ aontu vet --at '$.guard.http_request' guard.aon data/call-http-bad.json
  verdict: invalid

  $.guard.http_request.url: constraint [conflict]
    [aontu/constraint]: Cannot unify values at path $.guard.http_request.url
    expected: re("^https://")&length(integer&min(0)&max(2048))
    actual:   "http://169.254.169.254/latest/meta-data/"
    data: data/call-http-bad.json:4:12 ("http://169.254.169.254/latest/meta-data/")
    schema: registry.aon:69:19 (re("^https://")&length(integer&min(0)&max(2048)))
  $.guard.http_request.method: empty [conflict]
    [aontu/empty]: Cannot unify values at path $.guard.http_request.method
    data: data/call-http-bad.json:5:15 ("DELETE")
    schema: registry.aon:70:13 ("GET"|"HEAD")
  ```

  Each finding names the line in the call and the line in the schema,
  which is the repair material an agent needs to try again.
- **The MCP server is the same guardrail over JSON-RPC.** `check.sh`
  starts `aontu-mcp`, completes the initialize handshake, lists the
  tools, and calls `vet` for a good call and a bad one. The vet
  report is the tool result: a refusal comes back as `verdict:
  invalid` with `isError: false`, so the report is the answer the
  agent reads, not a protocol failure. `check.sh` also times 100
  vets through one server process and 20 cold CLI spawns and prints
  both, so you can weigh holding a server open against shelling out
  per call on your own machine.
- **`agentsmd` + `hash`**: `aontu agentsmd registry.aon` emits the
  AGENTS.md stanza (the pin, the top-level keys, the shape, and the
  verbs that query the document), and the stanza's pin is
  byte-identical to `aontu hash registry.aon`, so an agent can cheaply
  detect that the truth changed.

## What check.sh proves

1. `aontu registry.aon` matches `expected/registry.json` byte for
   byte: the six tool entries, their derived `requires_approval` flags
   and the docs table come out concrete, and the `type()`-marked
   schemas stay out.
2. `aontu --canon registry.aon` keeps the constraints, enums and
   deprecations: `re("^https://")`, `"GET"|"HEAD"` and
   `deprecate(integer&min(0)&max(10)` all appear in the canonical
   form.
3. `aontu get '$.tools.delete_records' registry.aon` matches
   `expected/tool-delete-records.json`: one tool's merged truth, as a
   dispatcher pulls it.
4. `aontu why '$.tools.delete_records.requires_approval' registry.aon`
   traces the flag to its `match()` rule:

   ```
   $.tools.delete_records.requires_approval = true
     1. type(("readonly"|"write")|"destructive")  registry.aon:28:13
     2. boolean  registry.aon:34:22
     3. match(.side_effect,"destructive",true,false)  registry.aon:171:22
   ```

5. `data/call-search-ok.json` is `verdict: valid`, exit 0.
6. `data/call-http-bad.json` (a cleartext URL at the metadata service,
   method `DELETE`) is `verdict: invalid`, exit 1, with a located
   `[aontu/constraint]` finding naming `re("^https://")` (the
   transcript above).
7. `data/call-delete-extra.json` carries a hallucinated `cascade`
   argument on `delete_records`: refused by `close()`,
   `[aontu/closed]` at `$.arguments.cascade`, exit 1.
8. `data/call-search-missing.json` omits the required `query`:
   `verdict: incomplete`, `[aontu/mapval_required]` at
   `$.guard.search_docs.query`, exit 3, so the dispatcher asks for
   the argument instead of dispatching.
9. `data/call-unknown-tool.json` names `drop_database`: `verdict:
   error`, `no_path` at the anchor `$.guard.drop_database`, exit 4.
10. `data/call-http-deprecated.json` sends `max_redirects`: `verdict:
    valid`, exit 0, with the deprecation warning `renamed (use
    $.argschemas.http_request.redirects) (since 1.4.0)` in the
    report.
11. `data/call-ticket-dup-labels.json` repeats a label: `verdict:
    invalid`, exit 1, `[aontu/constraint]` at
    `$.guard.create_ticket.labels` against
    `length(integer&min(0)&max(10))&unique()`.
12. `registry.aon` alone is not the guardrail entrypoint: `vet --at
    '$.guard.search_docs' registry.aon data/call-search-missing.json`
    is `verdict: error` with `no_path`, exit 4, because `$.guard`
    exists only in `guard.aon`.
13. `bad/rogue-tool.aon` registers `audit_log` metadata with no
    argument schema: `[aontu/closed]: Cannot resolve value at path
    $.tools.audit_log`, exit 1.
14. `bad/conflicting-rate.aon` restates the `search_docs` rate limit
    as 240 against the published 120: `[aontu/scalar_value]: Cannot
    unify values at path $.tools.search_docs.rate_limit.per_minute`,
    exit 1.
15. `aontu agentsmd registry.aon` emits the `<!-- aontu:begin -->`
    stanza with the top-level keys, and its pin equals the output of
    `aontu hash registry.aon`.
16. The MCP server: `initialize` answers with the server name
    `aontu`, `tools/list` matches `expected/mcp-tools.json` (`vet`,
    `get`, `why`, `diff`, `canon`, `summary`, `subsume`, `breaking`,
    `set`, `relations`, `reaches`, `hash`, `trim`, `jsonschema`), and
    the `vet` tool's `inputSchema` requires `schema` and `data`.
17. `tools/call` of `vet` admits the good call (`valid`, `isError:
    false`) and refuses the bad one with `invalid` and the
    `constraint` finding code.
18. 100 `vet` calls are answered by one server process, and the
    elapsed time is printed.
19. 20 cold-start CLI vets are timed and printed: the per-call price
    of shelling out instead of holding the server open.

## Running it

From this directory, `./check.sh` runs all 19 assertions and exits 0.
The dispatcher's two moves, by hand:

```sh
aontu registry.aon                                                        # the concrete registry
aontu vet --at '$.guard.search_docs' guard.aon data/call-search-ok.json   # vet one call at its tool's anchor
```
