# Use case 04: schema-evolution governance for a shared customer-profile schema

## Scenario

A customer-profile schema is the ground truth that dozens of services
(and, increasingly, coding agents) read and write. Once it is shared,
the hard problem is not validation but **evolution**: which changes are
safe to ship, which break a consumer that was correct yesterday, and
who decides. This use case models three released versions and a queue
of proposals, and drives aontu's whole evolution surface as the
governance machinery a schema registry (Confluent-style) would need:

- `profile-v1.aon` — v1.0.0: closed customer record (id, email, name,
  free-form `phone?`, strict `tier` enum, consent flags with safe
  defaults), plus the documented `aontu_policy.compat` declaration.
- `profile-v2.aon` — v2.0.0: additive minor (optional `locale`,
  optional validated `contact` block) and `phone` marked
  `deprecate(string, {msg, use, since})`.
- `profile-v3.aon` — v3.0.0: a major — `phone` removed, required
  `region` added.
- `proposals/` — the PR queue: a narrowed constraint, an added
  required key, a default flip, the staged deprecated-removal, and an
  adversarial PR that waives its own gate.
- `probes/` — minimal pairs isolating undecided verdicts, the gen
  profile, hash stability, and version-metadata friction.
- `data/` — instances a service or agent might emit, valid and not.

`check.sh` runs 32 asserted steps end to end (exit codes, error codes
grepped, JSON reports diffed against `expected/` goldens) and exits 0.

## How the model is designed

- **`close()` everywhere.** A governed record refuses undeclared keys;
  closedness is also what makes *removal* of a key visible to the gate
  (an open map would silently admit stragglers).
- **Constraint atoms** carry the field contracts: `re()` for id,
  email, phone (E.164), locale; `length(min(1))` for name;
  `integer & min(0)` for the proposed loyalty balance.
- **`*false | boolean`** for consent flags: a boolean default is only
  overridable by a boolean, so default and strictness coexist — the
  one shape where they do (see gap 1).
- **`deprecate(x, {msg, use, since})`** on `phone` in v2, pointing at
  its successor `$.profile.contact.phone`.
- **`aontu_policy: hide({compat: *backward | ...})`** in every
  version, per the documented idiom; `hide()` keeps it out of
  generated output.
- The **version number lives in the file name, not the document** —
  deliberately, after probing showed an in-document version string
  self-breaks the gate (gap 6).

## What worked

The core evolution loop is genuinely strong — better than expected:

- **The gate gives the right verdict on all four canonical changes.**
  Additive-under-closed: `verdict: compatible`, exit 0. Narrowed
  constraint: exit 1 `compat_narrowed`. Added required key: exit 1
  `compat_required_added`. Deprecate-then-remove: exit 1 plain, exit 0
  under `--allow-deprecated-removal` with the finding *kept* at
  `"severity": "warning"` — visible but not blocking, exactly what a
  reviewer wants.
- **Witness quality.** Findings name the path, both sides' canon, and
  file:row:col sites for both documents:

  ```
  $.profile.email: compat_narrowed [compat]
    the general residual does not contain the specific residual
    expected: re("^[^@ ]+@example[.]com$")
    actual:   re("^[^@ ]+@[^@ ]+[.][^@ ]+$")
    general: proposals/narrow-email.aon:6:19 (...)
    specific: profile-v2.aon:14:19 (...)
  ```

  Note the engine *decided regex containment* between two `re()`
  residuals — most schema tools punt on that.
- **Three-valued honesty.** `must()` (evaluate-only) on the new side
  answers `undecided / sub_evaluate_only` ("an evaluate-only check
  (must) makes the admitted set opaque"), exit 3, which **fails CI by
  default**; `--allow-undecided` is a visible human override, and the
  reason still prints. A `key()`-dependent spread answers
  `sub_path_dependent_spread` ("a path-dependent spread template
  cannot be compared structurally"). Both reason codes told me exactly
  why and what to do; they are actionable.
- **Profiles are real and observable.** Flipping
  `consent.marketing: *false|boolean` to `*true|boolean`:
  `--profile values` → `subsumes` (exit 0); `--profile defaults` (the
  gate's default) → `compat_default_changed` (exit 1), message "the
  effective default changed: previously generable documents
  materialise differently or become incomplete". Hiding a generated
  field is invisible to values/defaults and caught only by
  `--profile gen` as `compat_marks_changed` with a readable mark diff
  (`general {"type":false,"hide":true}, specific {...hide":false}`).
- **`aontu hash` is a real semantic pin.** A rewritten v2 (keys
  reordered, comments replaced, whitespace collapsed —
  `probes/v2-reformatted.aon`) hashes to the byte-identical
  `aon1-oUzLyquaExn0c2SEql1U-otsj-B0YP22HStsxHvucyU`; v3 moves it.
  `hash --form` prints the hashed text *with* the `close`/`hide`/
  `deprecate` marks, which is the right thing to diff when a pin moves.
- **`deprecate()` rides everything and surfaces everywhere it
  should**: vet reports `deprecated [compat]` at severity `warning`
  (exit stays 0), with the *data* site when the instance uses the
  field ("data: data/customer-legacy-phone.json:5:12 (\"555 0193\")"),
  the composed message carrying msg + use + since; the same mark is
  what `--allow-deprecated-removal` keys on one version later. The
  two-release rename choreography (deprecate in v2, remove in v3)
  works end to end.
- **`git#rev` gating** works as advertised: commit v1, edit to v2,
  `aontu breaking --against git#HEAD profile.aon` → exit 0; edit to
  the narrowed proposal → exit 1. One line in CI.
- **MCP `diff`** gives a clean path-level change list between versions
  (`removed $.profile.phone` with its deprecate canon, `added
  $.profile.region`), explicitly scoped: "Whether a change is BREAKING
  is the subsume verb's question, not this one."

## Gaps and friction

Every claim below was reproduced by `check.sh` or a probe in this
directory; output is verbatim (ANSI trimmed).

### 1. Enum-with-default is inexpressible (major)

> **2026-08-26: fixed by the preference admission gate (ADR-004) —
> assertions updated to the new behaviour.** `tier: *"standard" |
> "premium" | "enterprise"` is now a true enum-with-default: `"x"` is
> refused with `[aontu/|:empty]` and the unset field generates
> `"standard"`. The conjunct form below remains the phase-1 limit,
> and the `pref_not_instance` message now correctly says "any
> *remaining* alternative" (it is an advisory, not a soundness
> warning, post-gate). The record below is kept as written; this
> case's check.sh assertions did not pin the old behaviour.

The most common registry idiom — "one of these values, defaulting to
X" — could not be written as one field. A preferred scalar alternative
was overridable by its whole *kind*, so the enum stopped being an enum:

```
$ cat te.aon        # tier: *"standard" | "premium" | "enterprise"
                    # tier: "x"
$ aontu te.aon
{
  "tier": "x"
}
```

Any string is admitted. Swapping to the conjunct form restores
strictness but breaks the default (the documented phase-1 limit —
"a preference meeting a constraint in a CONJUNCT does not yet resolve
to the default"):

```
$ cat tc.aon        # tier: re("^(standard|premium|enterprise)$") & (*"standard" | string)
$ aontu tc.aon
[aontu/mapval_no_gen]: Cannot resolve value at path $.tier
This value was present after unification, and cannot be generated
because it is not a literal value.
```

You get validation XOR default, never both. The model therefore ships
`tier` strict with **no** default. Related message-quality issue: vet
warns `pref_not_instance` on `*"a" | "b"` ("the default \"a\" is not
an instance of any alternative of *\"a\"|\"b\"") — the message lists
"a" as an alternative while claiming it is not one (the lint excludes
the preferred branch itself), which reads as a false positive.

### 2. A missing required enum key vets as valid (major, soundness) -- FIXED 2026-08-27

**Closed by [ADR-007](../../ADR.md).** A required key whose schema
value is a literal disjunction was not checked for presence.
`data/customer-missing-tier.json` omits `tier` entirely, and now says
so:

```
$ aontu vet --at '$.profile' profile-v2.aon data/customer-missing-tier.json
verdict: incomplete

$.tier: disjunct_no_gen [incomplete]
$ echo $?
3
```

The rest of this entry is the diagnosis as it stood.

Compare `tier: string` (missing → `verdict: incomplete`, exit 3,
`mapval_required`). Minimal pair: `p: close({a: string, t: "x"|"y"})`
against `{"a":"hi"}` → `verdict: valid`, exit 0, empty findings — yet
the same document *evaluated* bare refuses to generate the enum:

```
$ aontu g1.aon      # t: "x" | "y"
[aontu/scalar_value]: Cannot unify values at path $.t
 Cannot unify value: "y" with value: "x"
```

So vet said "valid — concrete" and generation said "cannot unify": an
incoherent pair, and the incoherence was one line of generation. An
unresolved disjunction's members were FOLDED together with unify, which
produced that confusing bare-eval message (the source contains `|`, the
message talked about `&`-style scalar unification) and, being a
*conflict*, was filtered out by vet's incomplete-class pass. Both
surfaces now answer `disjunct_no_gen`, class incomplete, naming the
disjunction.

The v3 workaround — spelling required enums as regex constraints
(`region: string & re("^(us|eu|apac)$")`) — is no longer needed for
presence, and its price is now avoidable: a literal disjunction gives
the crisp `actual: "enterprise"` witness on narrowing where the regex
gives a residual-style one. v3 keeps the regex form here so the
comparison stays in the record.

### 3. The document under review can waive its own gate (major, governance)

`breaking` reads `$.aontu_policy.compat` from the **new** document. An
adversarial (or merely confused) PR that pins `compat: "none"` passes
a breaking change:

```
$ aontu breaking --against profile-v2.aon proposals/waive-gate.aon
verdict: compatible
$ echo $?
0
```

The countermeasure is CI always passing `--mode backward`, which
restores exit 1 — but then the declared policy is dead weight, and the
report gains three noise findings about `$.aontu_policy.compat` itself
(including a `sub_disjunct_distribution` and a
`compat_default_changed`) because the policy key is compared like any
other data. A registry needs the promise pinned on the *subject*, not
inside the artifact under review.

### 4. The deprecation warning fires without a point of use (minor, noise)

Vetting an instance that never uses `phone` still yields the warning,
anchored at the schema:

```
$ aontu vet --at '$.profile' profile-v2.aon data/customer-ok.json
verdict: valid

$.phone: deprecated [compat]
  deprecated: free-form phone is unvalidated; ... (since 2.0.0)
  schema: profile-v2.aon:20:11 (string)
```

The site *role* (schema: vs data:) does distinguish the cases in
`--format json`, so tooling can filter — but the text UX tells every
clean writer about every deprecated field, and there is no
`--strict-deprecated` to make *actual* usage fail CI (exit is 0 either
way). Also: extra keys in the deprecate record are silently dropped —
`deprecate(string, {msg:"m", sunset:"3.0.0", ticket:"CRM-482"})`
canonicalises to `deprecate(string,{"msg":"m"})` — so richer registry
metadata (sunset dates, tickets) is lost without a warning.

### 5. `--profile gen` is not reflexive on the documented policy idiom (bug)

**FIXED 2026-08-27.** Two ADR-004 leftovers, both closed: the
subsumption walk compared a pref MEMBER of a disjunction by its kind
superior (the pre-gate reading — a preferred branch contributes exactly
its own value), and the `gen` profile's mark rule fired inside a
DISTRIBUTION TRIAL, comparing a whole marked disjunction against a
member extracted out of one. `subsume --profile gen profile-v2.aon
profile-v2.aon` now answers `subsumes`, and a mark that really did
change is still refused. The diagnosis as it stood:

A document containing the *documented* `aontu_policy` declaration did
not gen-subsume **itself**:

```
$ aontu subsume --profile gen profile-v2.aon profile-v2.aon
verdict: undecided

$.aontu_policy.compat: sub_disjunct_distribution [compat]
  a specific alternative is not admitted member-wise, and no concrete
  counterexample settles the distribution case
  expected: *"backward"|"forward"|"full"|"none"
  actual:   *"backward"
$ echo $?
3
```

Minimised to `a: hide({c: *"x"|"y"})` — the hide + pref-disjunction
combination collapses the specific side to its default under gen.
Any gen-profile comparison of policy-carrying schemas is polluted.

### 6. No home for version metadata (major for a registry workflow)

A registry entry naturally carries its own version. aontu punishes
that: a concrete version string is compared like any field, and
`hide()` does not exempt it —

```
$ aontu breaking --against probes/meta-v1.aon probes/meta-v2.aon
verdict: breaking

$.meta.version: compat_narrowed [compat]
  a concrete value subsumes only itself
  expected: "2.0.0"
  actual:   "1.0.0"
```

— and the gate could not be anchored below the root. **FIXED
2026-08-27: `breaking --at` landed**, the same anchor `subsume` has
taken since G3, and it keeps `--mode`, the policy declaration and the
`--allow-*` flags, which the `subsume --at` workaround gave up:

```
$ aontu breaking --against probes/meta-v1.aon --at '$.profile' probes/meta-v2.aon
verdict: compatible
$ echo $?
0
```

A registry entry can now carry its own version and still be gated on
its contract. This model keeps version numbers outside the document
anyway, so the comparison above stays in the record as the
demonstration.

### 7. `diff` is not a CLI verb (minor, doc/CLI mismatch)

The scenario calls for `aontu diff a b`; the CLI refuses it:

```
$ aontu diff profile-v2.aon profile-v3.aon
aontu: the bare command evaluates one document, and 3 were given
aontu: a mistyped verb reads as a file name (try --help)
$ echo $?
2
```

The capability exists (library export + MCP tool, exercised in
check.sh via JSON-RPC over stdio) — it just has no CLI spelling, so a
shell-based registry pipeline has to spawn the MCP server to get a
change list. Related polish: `--canon` output omits the
`close`/`hide`/`deprecate` marks that `hash --form` prints, so the
"canonical form" under-reports the document's actual semantics.

### 8. `re()` portable subset refuses safe patterns (polish)

The natural locale pattern was rejected on syntactic, not semantic,
grounds:

```
[aontu/constraint_pattern]: Cannot constrain value at path $.profile.locale
This re() pattern is outside the supported subset. It uses
a quantifier applied to a group containing another quantifier, which
backtracks exponentially in JavaScript.
```

`^[a-z]{2}(-[A-Z]{2})?$` cannot backtrack exponentially (the inner
quantifier is bounded), but the conservative rule bans the shape;
the workaround `^[a-z][a-z](?:-[A-Z][A-Z])?$` is noise an agent or a
human must know to write. The error text itself is excellent —
it teaches the whole subset.

### What a schema-registry workflow would still need

- **Subject-side policy** (gap 3) and **exempt metadata** (gap 6):
  today the promise and the version cannot live safely in the artifact.
- **Transitive compatibility**: `--against` is repeatable, but
  enumerating all prior versions is the caller's job; nothing like
  Confluent's `BACKWARD_TRANSITIVE` until the module registry (G6) can
  list published versions.
- **Deprecation lifecycle**: `since` exists, but no sunset date
  survives (extra record keys are dropped, gap 4) and no vet mode
  fails on fresh usage of a deprecated field.
- **Verdict plumbing is already there**: exit classes 0/1/3/4/2,
  `--format json`/`sarif`, stable reason codes — a registry could be
  built *around* the gate today; the missing pieces are metadata
  placement and version enumeration, not the decision procedure.

## Verdict

Is the evolution story complete enough to govern a shared schema in
production? **The decision procedure, yes — the packaging, not yet.**
The subsume/breaking core is sound where it counts (it folds toward
"breaking"/"undecided", never silently toward "compatible"), the
reason codes are actionable, deprecate-then-remove works across a real
two-release choreography, and the hash pin plus git-integrated gate
are CI-ready today. What blocks production governance is the
periphery: two expressiveness holes around the most common idiom in
any registry (enum + default, gaps 1-2), self-waivable policy (3), no
safe home for version metadata (6), and one reflexivity bug in the gen
profile (5). All are fixable without touching the lattice.
