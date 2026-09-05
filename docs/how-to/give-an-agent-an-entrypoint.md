---
description: Generate a ground-truth stanza with `aontu agentsmd` and serve the verbs over MCP with `aontu mcp`.
group: run-embed
order: 60
---

# Give an agent an entrypoint to a definition

An agent working against a model needs two things: a stanza to read
before it starts, and a service to question while it works. aontu
ships both halves, and neither is written by hand.

The stanza first. `aontu agentsmd` derives it from the source, so it
cannot drift from what the document says. Write `system.aon`:

<!-- test: scenario agent-entrypoint -->
<!-- test: file system.aon -->
```aontu
services: { &: { replicas:*1 | integer tier:*standard | string } }
services: auth: replicas: 3
services: billing: tier: premium
```

<!-- test: run -->
```sh
$ aontu agentsmd system.aon
<!-- aontu:begin -->
## Ground truth: `system.aon`
...
- Pin: `aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE`
...
- Top-level keys: `services`
- Shape: `{"services":{&:top,"auth":top,"billing":top}}`
...
<!-- aontu:end -->
$ aontu agentsmd --write AGENTS.md system.aon
wrote: AGENTS.md
```

The stanza names the pin (the [canon-hash](pin-a-document-hash.md),
which survives reformatting and moves on any change of meaning), the
root keys, the shape, and the `get` / `why` / `vet` / `set` commands
spelled with a path that actually exists in the document. `--write`
splices it between the two markers, appending them when absent, and
touches nothing outside them—so re-run it in the same commit that
changes the definition.

The server second. `aontu mcp` is the `mcp` verb of the npm package's
command, speaking Model Context Protocol over stdio (the standalone
`aontu-mcp` binary runs the same server). Point a harness at it the
way you point it at any stdio MCP server:

<!-- test: skip MCP client configuration; the served contract is pinned by ts/test/mcp.test.ts -->
```json
{ "mcpServers": { "aontu": { "command": "aontu", "args": ["mcp"] } } }
```

It serves `vet`, `get`, `why`, `diff`, `canon`, `summary` and the
rest of the verb roster, each returning the same JSON contract the
matching CLI verb prints. A call that refuses (a bad path, a
document that does not hold) answers with its report and
`isError: false`, because the report is the answer.

It also evaluates confined: the source arrives from the caller, so
`@"..."` is denied rather than followed. Asking it to canonicalise
`a: @"./system.aon"` comes back as a finding, not a file read:

<!-- test: skip MCP tool response; the served contract is pinned by ts/test/mcp.test.ts -->
```json
{
  "ok": false,
  "canon": "",
  "findings": [
    {
      "code": "include_denied",
      "class": "reference",
      "severity": "error",
      "path": "$",
      "message": "include denied: ./system.aon (capability: none)",
      "sites": []
    }
  ]
}
```

(Started with `--root <dir>`, the server resolves includes confined
below that root instead, and accepts file-path arguments under it.)
The Go port ships no MCP binary—`Get`, `Why`, `Diff` and `AgentsMd`
are library calls for [embedding](call-from-go.md).

Details of both halves: [`aontu
agentsmd`](../reference-api.md#aontu-agentsmd) and [the MCP
server](../reference-api.md#the-mcp-server). The live version is
[use-cases/09-agent-tools](../../use-cases/09-agent-tools/): a tool
registry whose agent-emitted calls are vetted by exit code, with the
real MCP server driven over stdio in the checks. The verbs an agent
should reach for first are [query a path](query-a-path.md) and
[validate in CI](validate-in-ci.md).
