---
description: Mark schema and helper fields with `type()` or `hide()` so they constrain and compute without being generated.
group: compose
order: 50
---

# Keep schema and helper fields out of the output

A schema written next to its data has one job left after
constraining it: staying out of the generated JSON. A field whose
value is marked with `type(...)` or `hide(...)` is omitted when the
enclosing map generates, and still participates in unification. Park
the schema at its own key and reference it where it should apply:

```aontu
_schema: type({ id:integer name:string })

users: { &: $._schema ada:{ id:1 name:ada } bob:{ id:2 name:bob } }
```

```json
{ "users": { "ada": { "id": 1, "name": "ada" },
             "bob": { "id": 2, "name": "bob" } } }
```

`_schema` never appears, and it still constrains. Give `bob` a
string id in `users.aon`:

<!-- test: scenario schema-mark -->
<!-- test: file users.aon -->
```aontu
_schema: type({ id:integer name:string })

users: { &: $._schema ada:{ id:1 name:ada } bob:{ id:"two" name:bob } }
```

<!-- test: run -->
```sh
$ aontu users.aon
[aontu/no_scalar_unify]: Cannot unify values at path $.users.bob.id
...
$ echo $?
1
```

A mark belongs to the field its wrapper was written at, and a
reference copies the value with the marks cleared—which is why
`$._schema` constrains the children without hiding them, and why
marking `_schema` does nothing to any other field. Mark the field
the data itself arrives at and you silence the whole thing:

```aontu
user: type({ id:integer })
user: id: 7
```

```json
{}
```

Unified, constrained, then omitted. `type()` on the data's own field
is almost never what you meant.

`hide(...)` is the same mechanism for values you compute with but do
not emit:

```aontu
secret: hide("s3cret")
token: $.secret
```

```json
{ "token": "s3cret" }
```

The reference emits because it copied the value and left the mark
behind; `copy(...)` is the explicit spelling of that copy when you
want it on the page.

## Hide an invariant, keep it armed

The same mark carries policy. A rule that must hold on every
evaluation, without appearing anywhere in the output, is a hidden
block—here, "exactly one role holds the tenant":

```aontu
roles: owner: { tenantOwner:true rank:100 }
roles: admin: { tenantOwner:false rank:80 }
roles: auditor: { tenantOwner:false rank:20 }

registry_invariant: hide({
  one_owner: length(1) & filter($.roles, { tenantOwner:true })
})
```

```json
{ "roles": { "admin":   { "rank": 80,  "tenantOwner": false },
             "auditor": { "rank": 20,  "tenantOwner": false },
             "owner":   { "rank": 100, "tenantOwner": true } } }
```

The filtered set must have length 1, and the check costs the output
nothing. Promote `admin` to `tenantOwner: true` in `rbac.aon` and
the hidden block fails loudly:

<!-- test: file rbac.aon -->
```aontu
roles: owner: { tenantOwner:true rank:100 }
roles: admin: { tenantOwner:true rank:80 }
roles: auditor: { tenantOwner:false rank:20 }

registry_invariant: hide({
  one_owner: length(1) & filter($.roles, { tenantOwner:true })
})
```

<!-- test: run -->
```sh
$ aontu rbac.aon
[aontu/constraint]: Cannot unify values at path $.registry_invariant.one_owner
...
$ echo $?
1
```

The refusal prints the offending set (both roles claiming the
tenant, by name), so the reviewer reads the violation itself rather
than a bare verdict.

Marks are specified in [Marks: `type` and
`hide`](../reference-language.md#marks-type-and-hide). A
`type()`-marked block is also how you build a vocabulary of named
constraints—[name a reusable
constraint](name-a-reusable-constraint.md). The invariant recipe
runs live in the [RBAC policy](../../use-cases/05-rbac-policy/) use
case.
