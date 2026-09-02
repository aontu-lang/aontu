# 03 — a REST API contract as agent ground truth

## The scenario

A REST API contract for a project-management SaaS ("Nimbus Tasks"):
two entities (`User`, `Project`), four endpoints (list/create users,
get/create projects) with methods, paths, query shapes, request and
response bodies keyed by status code, and the single error envelope
every non-2xx response uses.

This is the document an AI coding agent codes against, and the
document it is *corrected by*: the agent emits a candidate request
body, `aontu vet` says what does not hold and where, the agent
repairs, and re-vets. `repair.py` is the mechanical half of that
loop, consuming `vet --format json`, and the checks drive it end to
end over agent-emitted candidates.

An API contract is the ground truth with the most dependants in an
organisation: every client, server, SDK, and test suite derives from
it. Holding agents to it cheaply turns contract drift, the classic
integration failure, into a CI error instead of a production
incident.

## The model

| file | role | constructs |
|---|---|---|
| `types.aon` | shared wire vocabulary (`$.types.*`) | `hide()`, `re()`, `min`/`max`, `length()`, enum disjunctions |
| `entities.aon` | `User`, `Project` | `close()`, optional `k?:`, refs |
| `errors.aon` | the error envelope | nested `close()`, inline list-spread template |
| `messages.aon` | request, query and page shapes: the vet anchors | `close()`, refs, `[ &: $.entities.User ]` |
| `api.aon` | endpoint registry | `&:` spread as self-policing shape, `type()` marks, numeric status-code keys |
| `contract.aon` | entry point | `@"file"` includes |
| `user-page.aon` | the page body as a root-anchored, single-message schema | vetted without `--at` |
| `evolution/tighten-page-size.aon` | a proposed v1.4 change: `page_size` capped at 50 | constraint meet (`max(100) & max(50)`) |
| `bad/new-endpoint-method.aon` | a `method: FETCH` endpoint | the registry spread refusing it |
| `repair.py` | the mechanical half of the agent loop | consumes `vet --format json` |
| `data/*.json` | agent-emitted candidates: request bodies, a query, and entity, page and envelope response bodies; one good, several wrong | |

The vocabulary in `types.aon` is `hide()`-marked: it never appears in
generated output, and every other file references it. `re()` implies
`string`, and where a pattern exists its quantifiers double as length
bounds (`Slug` is 3 to 40 characters by its regex alone);
`DisplayName` has no pattern, so it is sized with
`length(min(1) & max(80))`. `Timestamp` spells optional fractional
seconds as an unquantified alternation, `(Z|\.\d{3}Z)`, because `re()`
refuses a quantifier on a group that itself contains a quantifier (the
rule and its reason are in [the language
reference](../../docs/reference-language.md#re-and-the-portable-pattern-subset)).

Every wire message is `close()`d, so a surplus or misspelled key is a
conflict and never a silently ignored extra (the
`additionalProperties: false` of OpenAPI, in one call). The messages,
entities and error envelope stay unmarked, and they hold enums no
candidate has resolved, so the contract is a schema: `aontu
contract.aon` refuses to generate, and the ways to read it are
`--canon`, `hash`, `get '$.api'`, and `vet --at`.

The registry in `api.aon` constrains itself. Its `&:` spread applies
one closed endpoint shape (method, `/v1/` path, summary length, auth)
to every entry, so a malformed endpoint refuses to evaluate with no
tooling beyond the contract. The schema-bearing fields are
`type()`-marked: they unify, they serve as `vet --at` anchors, and
they are omitted from generation, so `get '$.api' contract.aon` prints
a concrete inventory in which each `responses` map is `{}`, and
`get --keys` lists the status codes.

`UserPage` is the list body, written once as
`items: [ &: $.entities.User ]`: the spread template validates an
array of any length, element by element. `user-page.aon` restates the
same four fields at the document root, so the page can also be vetted
without `--at`.

`repair.py` reads the JSON report and applies the repair each finding
implies. A `constraint` finding's `expected` residual
(`integer&min(1)&max(100)`) is enough to clamp a number. An `empty`
finding names the admissible alternatives in its schema site
(`"name"|"-name"|"created_at"|"-created_at"`), and the script
nearest-matches among them. A `closed` finding names the refused key,
and the script nearest-matches it against the declared keys from
`aontu get --keys`. A `closed` finding's path is relative to the
candidate document (`$.emial`) where a constraint finding's carries
the anchor (`$.msg.CreateUserRequest.email`); the script accepts
both spellings.

## What check.sh proves

1. `aontu contract.aon` does not generate: exit 1 with
   `[aontu/disjunct_no_gen]` at the first enum no candidate has
   resolved (the error envelope's `code`).
2. `--canon contract.aon` matches `expected/contract.canon` byte for
   byte: the ground-truth serialization is stable and keeps every
   constraint.
3. `get '$.api'` and `get '$.api.create_user'` match their goldens: a
   concrete endpoint inventory with the `type()`-marked schemas
   omitted.
4. That inventory prints `"responses": {}`;
   `get '$.api.create_user.responses' --keys` lists the status codes
   `201`, `400`, `409`.
5. `hash contract.aon` prints an `aon1-` pin, and
   `agentsmd contract.aon` emits a `Ground truth:` stanza naming the
   file and the pin.
6. `why '$.msg.CreateUserRequest.email'` traces the requirement to
   `messages.aon` (the `$.types.Email` reference at
   `messages.aon:9:12`, then the pattern at `types.aon:15:10`).
7. A well-formed `CreateUserRequest` candidate is `verdict: valid`,
   exit 0.
8. Wrong types (`"name": 42`, `"send_invite": "true"`) are refused,
   exit 1, with `[aontu/constraint]` and `[aontu/no_scalar_unify]`;
   the constraint finding carries
   `expected: string&length(integer&min(1)&max(80))`.
9. A malformed email and `"role": "owner"` are refused: the constraint
   finding shows the `Email` pattern as `expected`, and the
   `[aontu/empty]` finding lists the alternatives with the enum's own
   location:

    ```
    $.msg.CreateUserRequest.role: empty [conflict]
      [aontu/empty]: Cannot unify values at path $.msg.CreateUserRequest.role
      data: data/create-user-subtle.json:4:11 ("owner")
      schema: types.aon:35:15 ("admin"|"member"|"viewer")
    ```

10. A missing `name` is `verdict: incomplete`, exit 3, with
    `[aontu/mapval_required]`; the schema site names `types.aon` at
    the line that declares `DisplayName`, and the check reads that
    line back from the file the site names:

    ```
    $.msg.CreateUserRequest.name: mapval_required [incomplete]
      [aontu/mapval_required]: Cannot resolve value at path $.msg.CreateUserRequest.name
      schema: types.aon:29:25 (string&length(integer&min(1)&max(80)))
    ```

11. A missing `role`, a required enum, is `incomplete` too, exit 3:
    `$.msg.CreateUserRequest.role: disjunct_no_gen [incomplete]`. The
    loop's "add what is missing" branch covers both.
12. A misspelled key (`emial`) and a surplus key (`favourite_colour`)
    are refused with `[aontu/closed]`; each `closed` finding names the
    key with its data position, relative to the document, and carries
    no suggestion:

    ```
    $.emial: closed [conflict]
      [aontu/closed]: Cannot resolve value at path $.emial
      data: data/create-user-surplus.json:2:12 ("alan.turing@example.com")
    ```

13. A misspelled anchor (`--at '$.msg.CreateUserRequst'`) is
    `verdict: error`, exit 4, with
    `note: did you mean CreateUserRequest?`.
14. Repair round A, from `--format json` alone: the `constraint`
    finding carries `expected: integer&min(1)&max(100)` and
    `actual: 500`, so `repair.py` clamps `page_size` to 100; the
    `empty` finding has no `expected` field, but its schema site holds
    `"name"|"-name"|"created_at"|"-created_at"`, so the script corrects
    `"namez"` to `"name"`. The result matches
    `expected/query-repaired.json` and re-vets `valid`.
15. Repair round B: with the declared keys from
    `get '$.msg.CreateUserRequest' --keys`, the script renames `emial`
    to `email` and drops `favourite_colour`; the result matches
    `expected/surplus-repaired.json` and re-vets `valid`.
16. Two candidates in one run: the worst verdict wins (`invalid`,
    exit 1).
17. `--format sarif` is SARIF 2.1.0: two results, each located in the
    candidate file, with the native finding (code, `expected`, sites)
    under `properties`; the exit code is still 1, so CI upload and
    loop control coexist.
18. `--at '$.api.create_user.responses.201'` reaches the `User`
    entity through the registry's `type()` mark and numeric key; a
    well-formed 201 body is `valid`.
19. An error envelope with a `details` list is `valid` at
    `$.errors.Envelope`.
20. `--at '$.msg.UserPage'` vets a two-item page against the
    `[ &: $.entities.User ]` spread: `valid`.
21. `user-page.aon`, vetted without `--at`, answers all three verdict
    classes: the good page is `valid`; a page whose second user has
    the email `"grace.hopper@"` is `invalid` with a
    `[aontu/constraint]` finding that quotes the value and its
    position in the candidate; a page with no `total` is
    `incomplete`.
22. `bad/new-endpoint-method.aon` (`method: FETCH`), evaluated with
    `--canon --include-root .`, is refused by the registry spread:
    `[aontu/empty]`, `"FETCH"` against
    `"GET"|"POST"|"PATCH"|"DELETE"`.
23. `breaking --against contract.aon evolution/tighten-page-size.aon`
    is `verdict: breaking`, exit 1, with `compat_narrowed` on
    `PageSize` (`expected: integer&min(1)&max(50)`,
    `actual: integer&min(1)&max(100)`). The contract compared against
    itself is `verdict: compatible`, exit 0. It was `undecided` until
    2026-09-02: the `[ &: $.entities.User ]` template is
    path-dependent, and a path-dependent template was never compared
    structurally, so a byte-identical document came back undecided and
    the gate had to pass `--allow-undecided`. Two identical templates
    are now the same template, by their hash form
    (use-cases/BUGS.md 64).

## Running it

From this directory, `./check.sh` runs all 23 assertions and exits 0;
set `AONTU=` to point at another CLI build. The repair loop by hand:

```sh
aontu vet --at '$.msg.ListUsersQuery' --format json contract.aon data/list-users-query-bad.json > findings.json
python3 repair.py --candidate data/list-users-query-bad.json --findings findings.json --out repaired.json --anchor '$.msg.ListUsersQuery'
aontu vet --at '$.msg.ListUsersQuery' contract.aon repaired.json   # verdict: valid
```

The CI shape of the first command is in [Validate data in
CI](../../docs/how-to/validate-in-ci.md); the evolution gate is in
[Gate schema changes](../../docs/how-to/gate-schema-changes.md).
