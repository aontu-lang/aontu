---
description: Ask aontu allow whether a role may change a subtree before aontu model set writes it, with the answer read from a role model that is itself an aontu document.
group: query-change
order: 35
---

# Gate an agent's changes by role

An agent that edits a model under a role (`dev`, `product`, an
on-call rotation) has to be told no before it writes, and the rules
that say no should live in a document the same tools read. Write
`roles.aontu`:

<!-- test: scenario gate-by-role -->
<!-- test: file roles.aontu -->
```aontu
roles: dev: {
  allow: ["$.services" "$.deploy.*.replicas"]
  deny: ["$.services.*.tier"]
}
roles: product: allow: ["$.features" "$.services.*.description"]
```

Each role names the subtrees it may change and, optionally, the ones
it may not; `*` stands for any one key. Now ask, with the very
assignment the agent is about to hand `set`:

<!-- test: run -->
```sh
$ aontu allow --role dev roles.aontu '$.services.auth.tier="standard"'
verdict: refused
role: dev
$.services.auth.tier: refused by $.roles.dev.deny.0 ($.services.*.tier)
$ echo $?
1
```

The path is what is judged, and the value only has to be one value: a
second pair inside it would write a subtree the gate was not asked
about, so such a call is refused as usage. The answer names the rule
as a path into the role model, so `aontu model why '$.roles.dev.deny.0'
roles.aontu` lists who wrote it and where. Ask again for a path the
role does cover:

<!-- test: run -->
```sh
$ aontu allow --role dev roles.aontu '$.services.auth.replicas=4'
verdict: allowed
role: dev
$.services.auth.replicas: allowed by $.roles.dev.allow.0 ($.services)
```

Exit 0 is the cue to write. Given a `model.aontu` whose replicas are a
default:

<!-- test: file model.aontu -->
```aontu
services: {
  &: { tier: *standard|string replicas: *1|integer description?:string }
  auth: tier: premium
  billing: {}
}

features: dark_mode: false
```

the same assignment goes to [`aontu
set`](change-a-value-with-an-overlay.md) unchanged:

<!-- test: run -->
```sh
$ aontu model set '$.services.auth.replicas=4' --entry model.aontu --overlay overlay.aontu
verdict: valid
wrote: overlay.aontu
```

The gate and the write take one spelling, so a skill runs the first
and, on exit 0 alone, the second. Two answers are easy to misread. A
deny entry refuses the paths above it as well as the ones below: `dev`
may not change `$.services.auth` either, because a change there could
rewrite the tier, and asking about the parent is how an agent that
plans to replace a whole service finds that out. And a call that lost
its paths, or hands an empty one, is a usage error (exit 2), never
`allowed`, so a script that branches on exit 0 cannot be let through
by an empty question.

The rule in full, the `--at` and `--format json` flags, and the shape
every role must satisfy are under [`aontu
allow`](../reference-api.md#aontu-allow). The live version is
[use-cases/18-role-permissions](../../use-cases/18-role-permissions/),
where a closed role vocabulary governs a service model, an agent skill
asks before every write, and the proposals that touch a denied subtree
are refused with the rule named.
