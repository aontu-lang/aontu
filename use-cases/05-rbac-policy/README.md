# 05 — RBAC / authorization policy as ground truth

An RBAC model for a multi-tenant SaaS platform, modelled as **data,
not logic** (the Cedar/OPA-adjacent case): a permission catalog, an
exhaustive role registry with role→permission grants, tenant plans
gating features, and agent-emitted candidate documents (tenants, role
patches) vetted against the model. The point of the exercise: find
where modelling *policy* as lattice data genuinely stops.

Why it matters: in an agentic platform the authorization model is the
single document most in need of a ground truth. An agent that
hallucinates a permission string, invents a role, or grants the
wildcard to a collaborator role must be stopped by a machine-checkable
artifact, not by review. The model here is the registry a PDP
(OPA/Cedar) would be *compiled from* — the question is how much of the
policy's own integrity the language can carry.

Run `./check.sh` — 31 assertions, every command below is executed
against the real CLI, including the gap repros (asserted at their
*observed* behaviour so the record notices if the engine changes).

## Layout

| file | carries |
|---|---|
| `permissions.aon` | catalog; one `id()` entity per permission, `close()`d record shape, `risk` enum |
| `roles.aon` | `Role` = disjunction of two `close()`d shapes keyed by `privileged`; `close()`d exhaustive registry; `unique()` + `refer()` grants; same-layer `filter()+length()` invariant |
| `plans.aon` | entitlement as disjunction-of-closed-maps per plan (the tls pattern) |
| `tenant.aon` | the vet schema: `re()`/`neq()` slug, plain plan enum, `match()`-derived limits and tier, split-spread member records with `refer()` role FK, structural security implication |
| `example.aon` | concrete tenant composed with the schema → `expected/example.json` |
| `audits/` | same-layer compositions where `filter()+length()`, cross-field `length(max($.ref))` and `must()` actually work |
| `exhibits/` | the enum-with-default idiom in four spellings; ranked defaults; the registry invariant firing |
| `proposals/` | agent-emitted registry patches: new role (closed), hallucinated permission (refer), wildcard grant (neq) |
| `queries/` | hand-maintained set-as-map grant projections for `subsume` |
| `data/` | tenant candidates, good and bad, as JSON |

## What worked

- **`id()` + `refer()` as foreign keys is the best feature of the
  model.** Every permission and role is an entity; every grant and
  every member's role is a checked address. A hallucinated permission
  in an agent patch is a located error
  (`[aontu/refer_unresolved] ... refer()&"billing/refund"`), and an
  unknown role in a tenant document vets `invalid` with the same code
  — this is referential integrity JSON Schema simply does not have.
- **`close()` for exhaustiveness** does exactly what the scenario
  needs: `proposals/add-superuser-role.aon` dies with
  `[aontu/closed]: Cannot resolve value at path $.roles.superuser`.
  The role set cannot be extended by accident from any layer.
- **Conditional shapes (disjunction of closed maps)** carry both
  "if plan=free then sso=false" *and* the wildcard rule "no role
  grants admin/all unless privileged". The second is the nicer trick:
  the unprivileged `Role` branch puts `neq("admin/all")` on the
  grants **list spread**, i.e. universal quantification over list
  elements, and a violating patch fails at the exact element:
  `[aontu/constraint] ... $.roles.member.grants.3 ... Cannot unify
  value: "admin/all" with value: neq("admin/all")`.
- **`match()` as tier mapping** derives `limits` and `supportTier`
  from the data's plan during vet, so candidates cannot contradict
  plan-derived facts, and `why` explains the derivation with
  provenance: `$.tenant.supportTier = "community" / 1. match(.plan,
  "free","community",...) tenant.aon:30:16`.
- **`must()` failures report beautifully** (when they fire — see
  gap 4): `[aontu/must] ... The author's message is: corporate policy
  CP-114: MFA is mandatory for every tenant`.
- **Same-layer `filter()+length()`** expresses "exactly one owner"
  as an empty/counted witness set, and `hide()` keeps the check out
  of the output without suppressing it — `audits/two-owners.aon`
  fails with the two-owner witness map in the message.
- **`subsume` answers permission-subset** over set-as-map
  projections, with a real witness on failure
  (`compat_required_added` naming the missing grant), and the exit
  codes (0/1/3/4) make all of this scriptable in CI. Better than
  expected.
- **Canon preserves policy meaning**: `id("admin/all")`, `refer()`,
  and the `*"member"|"member"|"admin"|"owner"` default all survive
  `--canon`, so the canon-hash genuinely covers the *policy*, not
  just its JSON shadow.

## Gaps and friction

Verbatim outputs below are trimmed of ANSI codes and machine-absolute
path prefixes.

### 1. An enum with a default is not an enum (critical)

> **2026-08-26: fixed by the preference admission gate (ADR-004) —
> assertions updated to the new behaviour.** `*member | admin | owner`
> now refuses `superadmin` (`verdict: invalid`, `[aontu/|:empty]`,
> exit 1) and still generates `member` unset — the idiom below works
> as every consumer believed it did. The repeated-branch spelling
> silences the (now advisory) `pref_not_instance` warning and keeps
> the same enforcement, and the ranked-lint false positive at the end
> of this section is fixed (the effective default unwraps every pref
> layer). The conjunct-form limits (the `must()`-guarded and
> enforcement-only conjunct spellings losing the default) remain the
> documented G1 phase-1 limit. The original finding is kept below as
> the record.

The single most common schema idiom in policy — a closed role set
with a default — could not be written. A scalar preference was
overridable by **any** same-kind value, so the preferred branch
admitted every string:

```
$ aontu vet exhibits/enum-default-naive.aon data/invite-superadmin.json
verdict: valid

$.invite.role: pref_not_instance [compat]
  the default "member" is not an instance of any alternative of *"member"|"admin"|"owner"
  schema: exhibits/enum-default-naive.aon:8:18 ("member")
$ echo $?
0
```

`"superadmin"` is **valid** against `*member | admin | owner`. The
`pref_not_instance` warning fires on every vet of this schema — the
lint reads `*member` as removed from the alternatives, so the default
is "not an instance" of `admin|owner`. The documented repeated-branch
workaround silences the warning and changes nothing else:

```
$ aontu vet exhibits/enum-default-repeated.aon data/invite-superadmin.json
verdict: valid          # *member | member | admin | owner — still accepts superadmin
```

The enforcing spelling costs the default (`member | admin | owner`
refuses `superadmin` with `[aontu/|:empty]`, but the file no longer
evaluates alone), and the `must()`-guarded repair hits the documented
G1 phase-1 limit — a preference meeting a constraint in a conjunct
does not resolve to the default — so *it* loses generation instead:

```
$ aontu exhibits/enum-default-guarded.aon
[aontu/scalar_value]: Cannot unify values at path $.invite.role
 Cannot unify value: "admin" with value: "member"
```

Even the enforcement-only conjunct `(member|admin|owner) &
(*member|string)` drops the preference: its canon is
`{"role":"member"|"admin"|"owner"}` and generation fails. CUE's
`*"member" | "admin" | "owner"` gives both; Aontu currently makes you
choose. `tenant.aon` ships the repeated-branch form for
`defaultMemberRole` (default kept, set open — documented), and the
plain enum for `plan` (set closed, no default).

Related wart: with a **ranked** preference the repeated branch does
not even silence the lint — `defaultMemberRole: **member | member |
admin | owner` still warns, and the message shows a half-peeled
preference as the default:

```
$.tenant.defaultMemberRole: pref_not_instance [compat]
  the default *"member" is not an instance of any alternative of **"member"|"member"|"admin"|"owner"
```

### 2. Counting atoms fold against the wrong layer (critical)

`length` (and everything downstream of it: seat caps, exactly-one
invariants) only counts entries from its **own document layer**. A
sizing atom in a schema next to a spread folds against the
spread-only bag:

```
$ cat g1.aon
x: length(min(1)) & { &: {r: integer} }
$ aontu vet g1.aon g1.json          # data has one entry
verdict: error
$.x: constraint [conflict]
  expected: length(integer&min(1))
  actual:   {&:{"r":integer}}
$ echo $?
4                                    # "the schema is unusable on its own"
```

and a bound the schema layer happens to satisfy **vanishes
silently**:

```
$ cat g2.aon
x: length(max(2)) & { &: {r: integer} }
$ aontu vet g2.aon g2.json           # data has THREE entries
verdict: valid
```

The same holds across `@` includes, in both directions — with data
`x: {a:{r:1},b:{r:2},c:{r:3}}` in an included file, `x: length(3)`
in the includer **fails** (counts 0) and `x: length(max(2))`
**passes**. This contradicts the reference's "sizing atoms fold last
… after every value that could contribute a member" for any
composition that crosses a file or the vet meet; within one document
(`audits/*.aon`, `roles.aon`) the promise holds and the invariants
work. Consequence: **a data-dependent counting invariant cannot live
in a reusable schema.** The model keeps them in same-layer audit
compositions, which means the guard must be restated wherever data is
composed.

### 3. Stale references under vet (critical)

A schema branch keyed on a data-supplied field *via a reference*
silently passes vet — the reference is resolved against the schema
alone and never re-checked against the merged data:

```
$ cat g3.aon
Ent: type( close({ plan: "free", sso: false }) | close({ plan: "pro", sso: boolean }) )
t: { p: string, e: $.Ent & { plan: $.t.p } }
$ aontu vet g3.aon g3.json           # data: p="free", e.sso=true
verdict: valid
```

The identical composition as one evaluation catches it
(`[aontu/|:empty]: Cannot unify values at path $.t.e`). The model
works around it by requiring candidates to carry
`entitlement.plan` themselves, so branch selection runs on data-side
scalars; the reference tie stays for eval-mode consistency. But
"vet and evaluate disagree about the same composition" is exactly
what a ground-truth system must not do.

### 4. `must()` is same-layer only, and fails **silently** (critical)

```
$ cat g4.aon
s: {t: integer} & must({t: max(60)}, "session too long")
$ aontu vet g4.aon g4.json           # data: t=120
verdict: valid
```

Same file, same rule, same data: `[aontu/must] … session too long`.
A Band-B check that evaporates when the peer arrives from another
layer is worse than not having it — the schema *looks* guarded. This
is why `tenant.aon` states the MFA implication structurally
(`close({mfaRequired:true, …}) | close({mfaRequired:false,
sessionTimeoutMinutes: … max(60)})`) — which does fire under vet —
and `must()` appears only in the audit layer.

### 5. An unresolved disjunction vets as valid (major)

A candidate with **no plan at all** is `verdict: valid` (check 9),
because `p: a | b` with data `{}` counts as satisfied — while
evaluating the same document fails (reported, confusingly, as
`[aontu/scalar_value] … Cannot unify value: "b" with value: "a"`, the
branches unified with each other). A kind-typed field is correctly
`incomplete` (`name` missing → exit 3, `mapval_no_gen`). So required
enum fields need data to be complete-checked some other way.

### 6. Quantification stops at "one filter condition deep" (major)

The exercise "every role that has X also has Y" is expressible only
when X and Y are **scalar fields** of the child (`filter($.roles,
{tenantOwner: true})` — the empty/counted witness-set pattern).
Everything derived fails:

- The hole cannot be projected: `pack($.roles, {wildcard:
  match(_.privileged, …)})` →
  `Cannot resolve value: . unspellable.privileged`.
- A relative reference works as a plain field value inside a pack
  template (`b: .src.p` fine) but **not as a call argument**:
  `b: match(.src, {p:1}, small, big)` →
  `[aontu/no_path] … Cannot resolve value: .src` at the nonsense path
  `$.checks.NaN.b`.
- Filter conditions cannot see into lists: a spread-carrying
  condition `filter($.roles, {grants: [&: neq("admin/all")]})` keeps
  **nothing** (the meet always "changes" the child), so
  "role whose grants contain X" is not a writable condition.
- There is no count *accessor*, so two computed counts cannot be
  compared ("|unprivileged roles| == |unprivileged roles with clean
  grants|" is unwritable).

The honest workarounds used here: put per-element rules on the
element (`neq` on the list spread), and turn "for all" into "the
witness set is empty/size-1" where the condition is scalar. Anything
past that belongs to the exporter.

### 7. No set operations; grant sets are hand-projected (major)

Grants are naturally sets; lists are positional. `subsume` on the
same two grants reordered:

```
$ aontu subsume la.aon lb.aon        # ["project/read","member/read"] vs reversed
verdict: does_not_subsume
$.g.0: compat_narrowed [compat]
  a concrete value subsumes only itself
```

Subset queries work only over **set-as-map** projections
(`queries/*.aon`), which the language cannot derive from the
list-shaped grants — they are maintained by hand, in step with
`roles.aon`, which is exactly the drift a ground-truth system exists
to prevent. (Positional lists also make grant *extension* awkward:
`proposals/extend-member-grants.aon` must restate the existing prefix
to add one grant.) A projection/`each`-into-map operator, or the
reserved unique-by-projection arity, is the missing piece.

### 8. `refer()` inside a `close()`d spread template never settles (major)

```
members: { &: close({ role: refer() & string }) }   # + data member
→ [aontu/mapval_no_gen]: Cannot resolve value at path $.members.ada
```

Without `close` it works. The model splits the spread —
`&: close({role: string, invitedBy?: string})` plus `&: {role:
refer()}` — which keeps both typo-sealing and the FK check (verified
by check 5 and the `[aontu/closed] … $.members.ada.rolle` typo test
during development). Undocumented interaction; costs an idiom that
should just work.

### 9. Error-quality frictions (minor–major)

- A refer failure under a spread is located at the **template**, not
  the member: `$.tenant.members.role` — which of forty members holds
  the bad role is not named (the data line/column is, which saves
  it in practice).
- A failed disjunction-of-closed-maps prints the *entire* disjunction
  against the *entire* data map (`|:empty`, check 4) with no
  per-branch diagnosis. When a data-side scalar pins the branch
  first, the error is excellent (`sso: true` vs `false` at the exact
  key) — the difference is whether anything selected the branch
  before it died.
- `proposals/extend-member-grants.aon` reports a spurious
  `[aontu/unify_cycle] … Cannot unify value: id(key(0)) with value:
  id(key(0))` *before* the real `refer_unresolved`, and its source
  snippets mix line numbers from `roles.aon` with text from the
  proposal file.
- Bare strings refuse hyphens (`slug: acme-rockets` →
  `[aontu/unexpected]: unexpected character(s): -`) — fine as a rule,
  but surprising in a model whose natural vocabulary
  (`acme-rockets`, `team-pay`) is hyphenated. Quote them.

### Rule precedence: not modelled, honestly

Cedar's `forbid` overriding `permit`, or OPA's rule ordering, has no
lattice counterpart — unification is commutative, so there is no
"later rule wins". The model's substitutes are: ranked defaults
(`**` org baseline vs `*` team override — works, check 23) for
*values*, and first-match `match()` for *derivation*. Neither is
deny-overrides for decisions. That is the right boundary: a
deny-override is a decision procedure, not a fact.

## Verdict: does "export to OPA/Cedar" hold up?

Mostly yes — for the **data half**. The catalog, registry, plans and
tenants come out of `aontu example.aon` as validated, referentially
sound JSON that compiles directly to Cedar entities or an OPA data
document, and `hash`/`subsume`/`breaking` give the change-control
story a PDP lacks. The model stops, and the exporter must take over,
at: authorization *decisions* (any allow(principal, action,
resource)), quantified registry invariants beyond scalar-field
filters, set-typed grant reasoning, and precedence. What does **not**
hold up today is subtler than that boundary: the three *silent-pass*
behaviours (counting atoms across layers, `must()` across layers,
stale references under vet) mean the schema can contain guards that
look enforced and are not — for a ground-truth system, a guard that
lies is worse than a missing feature, and those three are the
findings this use case most wants fixed.
