---
description: Print what a document means—defaults, disjunctions and all—instead of what it resolves to.
group: run-embed
order: 40
---

# See the canonical form

Generation answers "what does this resolve to?", and in answering it
erases the thing a schema author cares about: what the document still
admits. The canonical form keeps that. Write `timeout.aon`:

<!-- test: scenario canon -->
<!-- test: file timeout.aon -->
```aontu
timeout: *30 | integer
```

Now evaluate it both ways:

<!-- test: run -->
```sh
$ aontu timeout.aon
{
  "timeout": 30
}
$ aontu --canon timeout.aon
{"timeout":*30|integer}
```

Generation resolves the default; `--canon` keeps the whole
default-and-type so you can see what a caller may still override. Where
information has fully arrived, the two agree—a constraint
[met](../unification.md) by a concrete value canons to just the value.
Write `pinned.aon`:

<!-- test: file pinned.aon -->
```aontu
a: 1
a: number
```

<!-- test: run -->
```sh
$ aontu --canon pinned.aon
{"a":1}
```

From code, the same view is the `canon` property of a unified value:

<!-- test: skip TypeScript API sample; the canon surface is pinned by ts/test/ -->
```ts
aontu.unify('a: *1 | number').canon   // '{"a":*1|number}'
aontu.unify('a: 1 a: number').canon   // '{"a":1}'
```

<!-- test: skip Go API sample; the canon surface is pinned by the go/ test suite -->
```go
v, _ := a.Unify("a: *1 | number")   // v.Canon() == `{"a":*1|number}`
```

A conflict throws before there is anything to read, so ask for the
wreckage with `collect: true` ([collect errors](collect-errors.md));
the failed path reads `nil`:

<!-- test: skip TypeScript API sample; the canon surface is pinned by ts/test/ -->
```ts
aontu.unify('a: number a: string', { collect: true }).canon  // '{"a":nil}'
```

Canon is deterministic and reparseable, which is why it carries more
weight than a debugging view: it is the text the `aon1-` pin is
derived from, so "same canon" is this project's working definition of
"same meaning" ([pin a document hash](pin-a-document-hash.md)).

The exhaustive rendering rules—key order, number forms, what
recursion renders as—are in the language reference under
[Canonical form](../reference-language.md#canonical-form).
