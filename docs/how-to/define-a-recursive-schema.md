---
description: Reference a definition inside itself to get a schema that applies at every depth of the data.
group: schemas
order: 50
---

# Define a recursive schema

An approval chain, a comment thread, a filesystem tree: the data is
self-similar, and the schema should be written once. Reference the
definition inside itself—that reference means the fixpoint, and the
schema applies at every depth of the data:

```aontu
spec: hide({
  Step: {
    approver: string & re("^[a-z]+@acme[.]example$")
    decision: *pending | pending | approved | rejected
    then?: $.spec.Step
  }
})
policy: $.spec.Step & {
  approver: "lead@acme.example"
  decision: approved
  then: { approver:"cfo@acme.example" then:approver:"audit@acme.example" }
}
```

```json
{
  "policy": {
    "approver": "lead@acme.example",
    "decision": "approved",
    "then": {
      "approver": "cfo@acme.example",
      "decision": "pending",
      "then": {
        "approver": "audit@acme.example",
        "decision": "pending"
      }
    }
  }
}
```

`$.spec.Step` written inside `Step` is the whole trick: no marker, no
unrolled copies, and every level of the chain [met](../unification.md)
the `re()` and got the ranked `decision` default. The recursive position
expands one level per meet with concrete data, so validation descends
exactly as far as the data does—no maximum depth to configure, no
blind spot past it.

## Guard the recursion

The `?` on `then?:` is the guard: an optional recursive tail simply
drops where the data stops. A ranked default guards the same way,
ending the structure with an explicit value instead of an absence:

```aontu
schema: hide({ Node:{ v:integer next:*null | $.schema.Node } })
doc: $.schema.Node & { v:1 next:v:2 }
```

```json
{
  "doc": {
    "v": 1,
    "next": {
      "v": 2,
      "next": null
    }
  }
}
```

The recursion also runs through list templates, which is how a
comment thread types its replies:

```aontu
spec: hide({
  Comment: { author:string text:string replies?:[&: $.spec.Comment] }
})
thread: $.spec.Comment & {
  author: "alix"
  text: "ship it"
  replies: [
    { author:"bo" text:"+1" }
    { author:"cy" text:"hold on" replies:[{ author:"alix" text:"?" }] }
  ]
}
```

```json
{
  "thread": {
    "author": "alix",
    "text": "ship it",
    "replies": [
      {"author": "bo", "text": "+1"},
      {"author": "cy", "text": "hold on",
       "replies": [{"author": "alix", "text": "?"}]}
    ]
  }
}
```

A wrong value three levels down is an ordinary located error
(`$.thread.replies.1.replies.0.author`), because each level of data
expanded the schema one more level to meet it.

## The unguarded tail refuses

Guardedness is emergent—the engine never analyses the schema for
well-foundedness, the data decides. Drop the `?` and the schema still
evaluates, but no finite document can satisfy it. Write this as
`chain.aon`:

<!-- test: scenario recursion-unguarded -->
<!-- test: file chain.aon -->
```aontu
spec: hide({ Step:{ approver:string then:$.spec.Step } })
doc: $.spec.Step & {
  approver: "lead@acme.example"
  then: approver: "cfo@acme.example"
}
```

<!-- test: run -->
```sh
$ aontu chain.aon
[aontu/recursion_unexpanded]: Cannot recurse value at path $.doc.then.then
...
$ echo $?
1
```

The refusal lands at `$.doc.then.then` (the exact position the data
ran out), and the error's hint states the repair:

```
Guard the recursion -- an optional key (next?:) drops when nothing
arrives, and a preferred alternative (*null | $.Node) generates --
or supply the data.
```

## The canon stays finite

An infinitely deep type still has a one-line canonical form, because
recursion renders symbolically. Put the vocabulary alone in
`spec.aon`:

<!-- test: scenario recursion-canon -->
<!-- test: file spec.aon -->
```aontu
spec: hide({
  Step: {
    approver: string & re("^[a-z]+@acme[.]example$")
    decision: *pending | pending | approved | rejected
    then?: $.spec.Step
  }
})
```

<!-- test: run -->
```sh
$ aontu --canon spec.aon
{"spec":{"Step":{"approver":re("^[a-z]+@acme[.]example$"),"decision":*"pending"|"pending"|"approved"|"rejected","then"?:$.spec.Step}}}
$ aontu hash spec.aon
aon1-sgTj1hvqaL8vHdKZrlH7eaPbKeE9UW28b9WGBlVW9hw
```

The definition stays one reference deep (`"then"?:$.spec.Step`), so
the `aon1-` hash pins the mu-form of the schema, not any unrolling of
it. That single string is a version pin for the whole recursive
vocabulary—data instances unroll to their own depth without moving
it.

## Vet plain JSON at any depth

The same anchored vet that checks flat records checks recursive ones,
against data that carries no Aontu syntax at all. With `spec.aon`
still in place, put a chain in `chain-good.json`:

<!-- test: file chain-good.json -->
```json
{
  "approver": "lead@acme.example",
  "decision": "approved",
  "then": {
    "approver": "cfo@acme.example",
    "decision": "pending"
  }
}
```

and a chain that goes wrong one level down in `chain-bad.json`:

<!-- test: file chain-bad.json -->
```json
{
  "approver": "lead@acme.example",
  "decision": "approved",
  "then": {
    "approver": "EXTERNAL@other.example",
    "decision": "maybe"
  }
}
```

Now vet both against the definition:

<!-- test: run -->
```sh
$ aontu vet --at '$.spec.Step' spec.aon chain-good.json
verdict: valid
$ aontu vet --at '$.spec.Step' spec.aon chain-bad.json
verdict: invalid

$.spec.Step.then.approver: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.spec.Step.then.approver
  expected: re("^[a-z]+@acme[.]example$")
  actual:   "EXTERNAL@other.example"
  data: chain-bad.json:5:17 ("EXTERNAL@other.example")
  schema: spec.aon:3:24 (re("^[a-z]+@acme[.]example$"))
$.spec.Step.then.decision: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.spec.Step.then.decision
  data: chain-bad.json:6:17 ("maybe")
  schema: spec.aon:4:15 (*"pending"|"pending"|"approved"|"rejected")
$ echo $?
1
```

Both findings are located in the schema's namespace at the depth the
data failed, with the data site beside them.

The live version of all of this is
[use-cases/13-recursive-schema](../../use-cases/13-recursive-schema/),
an approval-chain model whose `check.sh` asserts every moment shown
here. The semantics are specified in [Recursive
references
(fixpoints)](../reference-language.md#recursive-references-fixpoints),
mutual recursion and recursive aliases included.
