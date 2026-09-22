# aontu

**JSON structure unifier.** A small language, and an engine that merges
partial structures into one consistent result: or reports exactly
where they conflict.

Schema, defaults and data are the same kind of thing, combined by one
operation: *unification*. Any JSON document is already valid aontu, so
an agent's output can be checked against a definition with no
conversion step.

```sh
npm install -g aontu
```

## The 30-second version

```aontu
# a schema, a default, and data — one notation, one operation
port: integer
port: *8080|integer
host: string
host: "localhost"
```

```sh
$ aontu service.aontu
{ "host": "localhost", "port": 8080 }
```

A second `port: "high"` does not overwrite anything: it is a located
conflict, reported with both sites.

## Validate, query, explain

```sh
aontu vet service.aontu deploy.json   # does this data satisfy this schema?
aontu model get '$.services.auth' sys.aontu # one evaluated slice
aontu model why '$.services.auth.port' sys.aontu  # what contributed, and where
aontu breaking --against git#main sys.aontu # is the new version compatible?
aontu hash sys.aontu                  # a pin over MEANING, not bytes
```

`vet` exits by verdict class (0 valid, 1 invalid, 3 incomplete, 4 the
schema itself is broken), so an agent loop can branch on it, and speaks
JSON and SARIF as well as text.

There is also an MCP server (`aontu-mcp`) exposing `vet`, `get`, `why`,
`diff`, `canon` and `summary` over the same contracts the CLI prints,
and a language server (`aontu-lsp`).

## Library

```js
const { Aontu, vet } = require('aontu')

const report = vet(schemaSrc, dataSrc, { trust: { include: 'none' } })
report.verdict   // 'valid' | 'invalid' | 'incomplete' | 'error'
report.findings  // located, coded, with the sites that conflicted
```

**Evaluating a document you did not write runs it.** `@"…"` resolves
through the filesystem and package chain by default, so pass a `trust`
profile (`{ include: 'none' }`, a virtual file set, or a confined
root) whenever the source is not yours. See
[the trust contract](https://github.com/aontu-lang/aontu/blob/main/docs/trust.md).

## Two implementations, one specification

TypeScript (this package) is canonical; a Go port
(`github.com/aontu-lang/aontu/go`) mirrors it. Both are checked against
one language-agnostic suite of `.tsv` rows, so the same document means
the same thing in a Node agent harness and a Go gateway.

## Documentation

- [Documentation home](https://github.com/aontu-lang/aontu/blob/main/docs/index.md)
- [Tutorials](https://github.com/aontu-lang/aontu/blob/main/docs/tutorial.md)
- [Language reference](https://github.com/aontu-lang/aontu/blob/main/docs/reference-language.md)
- [Generation reference](https://github.com/aontu-lang/aontu/blob/main/docs/reference-generation.md)
- [Functions reference](https://github.com/aontu-lang/aontu/blob/main/docs/reference-functions.md)
- [Error reference](https://github.com/aontu-lang/aontu/blob/main/docs/reference-errors.md)
- [API and CLI reference](https://github.com/aontu-lang/aontu/blob/main/docs/reference-api.md)
- [Agent skill](https://github.com/aontu-lang/aontu/blob/main/docs/skill/SKILL.md)

aontu is inspired by [CUE](https://cuelang.org/), as a
purpose-specific dialect.

## License

MIT
