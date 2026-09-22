# `ref/` — the reference, vendored

Read-only. **Nothing here is ours**, and nothing here is edited: these
are the artifacts `rb-solar` is held to, copied verbatim from

> [voxgig-sdk/voxgig-solardemo-sdk](https://github.com/voxgig-sdk/voxgig-solardemo-sdk)
> at `5b8eae968637ebe507c915fe804131d60ef16e15`, MIT licensed,
> Copyright (c) 2026 Voxgig.

| file | upstream path | what it is |
|---|---|---|
| `openapi.yaml` | `app/def/solardemo-1.0.0-openapi-3.0.0.yaml` | the API's OpenAPI 3.0 description |
| `validate.ts` | `app/validate.ts` | the reference validation, 20 tests over HTTP |
| `solar.data.json` | `app/solar.data.json` | the seed data: eight planets, twenty-one moons |

`validate.ts` runs against **any** implementation of the API — it takes
a base URL and speaks HTTP — which is what makes it usable as the gate
for an implementation written in another language entirely.

## The spec and the validation disagree, and the validation wins

The OpenAPI `Planet` schema has four properties: `id`, `name`, `kind`,
`diameter`. `validate.ts` additionally requires a planet to carry
**`terraformState`**, **`forbidState`** and **`forbidReason`** — tests
6 and 8 read them back after the `terraform` and `forbid` actions, and
the spec's responses for those actions describe only the `{ok, state}`
envelope they return, not the fields the state lands in.

`rb-solar`'s model therefore states all seven fields, and
`model.aontu` marks the three the spec omits. The rule for this
directory is that the **executable** reference decides: a spec is a
description, and the validation is what runs.

## Refreshing

Re-copy all three from the upstream repository at one commit, update
the SHA above, and run `check.sh`. A change to the reference that
`rb-solar` fails is a change to the API, which is the reference's to
make and ours to follow.
