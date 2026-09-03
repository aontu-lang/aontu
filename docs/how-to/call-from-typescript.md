---
description: Embed the engine in Node with the `Aontu` class—parse, unify and generate from your own code.
group: run-embed
order: 20
---

# Call Aontu from TypeScript

The npm package `aontu` is not a wrapper around the CLI—the CLI is a
thin client over the class the package exports. Requires Node ≥ 22.
Three methods cover most embeddings:

<!-- test: skip TypeScript API sample; the API is pinned by ts/test/ -->
```ts
import { Aontu } from 'aontu'

const aontu = new Aontu()

aontu.generate('a: 1 b: $.a')   // { a: 1, b: 1 }   (a plain JS value)
aontu.unify('a: *1 | number')   // a Val; .canon is '{"a":*1|number}'
aontu.parse('a: number')        // a Val AST, not yet unified
```

`generate` throws an `AontuError` on a conflict, or when the result is
not fully concrete—a schema is a valid document but not a generable
one. When you want to see an unresolved or schema-bearing result
rather than a final value, take `unify(...).canon`
([see the canonical form](see-canonical-form.md)); when you want every
problem instead of the first throw,
[collect errors](collect-errors.md).

Two habits keep an embedding correct. Serialise generated output with
the package's `exactJSON`, never `JSON.stringify`: a document using
`0d` exact literals generates `bigint` and `Decimal` values that
`JSON.stringify` refuses to write
([exact numbers](../reference-api.md#exact-numbers-and-exactjson)).
And treat a parsed `Val` tree as single-use—unification refines it
in place, so parse again for every independent evaluation
([evaluation consumes the
tree](../reference-api.md#evaluation-consumes-the-tree)). The string
entry points parse per call and are always safe.

The full surface (options, contexts, the `Val` classes, and the
library forms of the CLI verbs: `vet`, `get`, `why`, `subsume`, …)
is the [TypeScript API reference](../reference-api.md#typescript-api).
To parameterise a model from code, [inject host
values](inject-host-values.md); for the Go port,
[call Aontu from Go](call-from-go.md).
