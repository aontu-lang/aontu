#!/usr/bin/env bash
# check.sh --- drive the aontu CLI end to end over the RBAC/authz
# policy model and assert every outcome (including the observed gaps
# the README documents). Runnable from any cwd.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$DIR/../.."
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); echo "ok $pass - $1"; }

# run <name> <expected-exit> -- <cli args...>
run() {
  local name="$1" want="$2"; shift 3
  local got=0
  $AONTU "$@" >"$WORK/$name.out" 2>"$WORK/$name.err" || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.out" "$WORK/$name.err" >&2; fail "$name: exit $got, wanted $want"; }
}

# has <name> <stream> <pattern> -- grep -F the captured stream.
has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}
hasnt() {
  ! grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 unexpectedly contains: $3"; }
}

# ---------------------------------------------------------------- model
# 1. The whole model evaluates: catalog + closed role registry +
# concrete tenant, with limits_supportTier derived by match().
run eval 0 -- "$DIR/example.aon"
diff -u "$DIR/expected/example.json" "$WORK/eval.out" \
  || fail "example.aon output drifted from expected/example.json"
ok "example.aon evaluates to the expected policy document"

# 2. Canonical form keeps the policy's meaning: the ADDRESSES, the
# preserved default, and the refer() foreign-key constraints.
#
# Since ADR-014 there are no entity identities to keep: a node's name IS
# its path, so what canon has to preserve is the address a grant was
# written with. The assertion moved with the mechanism rather than
# being dropped -- if `path($.permissions.admin_all)` stopped surviving canon,
# a round-tripped policy would grant nothing.
run canon 0 -- --canon "$DIR/example.aon"
has canon out 'path($.permissions.admin_all)'
has canon out '*"member"|"member"|"admin"|"owner"'
has canon out 'refer()'
ok "canon keeps the grant addresses, the * default and refer()"

# ------------------------------------------------- vetting candidates
# 3. A well-formed candidate is valid, with no warnings.
run good 0 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-good.aon"
has good out 'verdict: valid'
hasnt good out 'pref_not_instance'
ok "vet: good tenant is valid and warning-free"

# 4. Conditional shape: a free-plan tenant enabling SSO fails the
# entitlement disjunction of closed maps.
run sso 1 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-free-sso.aon"
has sso out 'verdict: invalid'
has sso out '[aontu/empty]'
has sso out '$.tenant.entitlement'
ok "vet: free plan + sso refused by the closed-map disjunction"

# 5. Foreign key: a member holding an undeclared role.
run role 1 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-unknown-role.aon"
has role out '[aontu/refer_unresolved]'
ok "vet: unknown role name is a refer_unresolved error"

# 6. Constraint atoms: a reserved slug dies on neq()/re().
run slug 1 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-bad-slug.aon"
has slug out '[aontu/constraint]'
has slug out 'neq("admin"'
ok "vet: reserved slug refused by neq()+re()"

# 7. Structural implication: no MFA + long sessions fails the
# security disjunction (the must() form is a silent no-op here).
run mfa 1 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-no-mfa.aon"
has mfa out 'verdict: invalid'
has mfa out '$.tenant.security'
ok "vet: no-MFA long-session tenant refused structurally"

# 8. Missing required kind-typed field -> incomplete (exit 3).
run noname 3 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-no-name.aon"
has noname out 'verdict: incomplete'
has noname out '[aontu/mapval_no_gen]'
ok "vet: missing name reported incomplete (exit 3)"

# 9. GAP CLOSED 2026-08-27 (ADR-007). A candidate with NO plan at all
# used to be `verdict: valid`: generation FOLDED the unresolved
# `free|pro|enterprise` into a scalar conflict, and vet -- which keeps
# incomplete-class findings -- filtered it out. It is now
# `disjunct_no_gen`, class incomplete, and the candidate is refused.
# The verdict is `invalid` rather than `incomplete` because the same
# run also reports conflicts: with no plan to select, the cross-field
# tie `entitlement: $.Entitlement & {plan: $.tenant.plan}` now FIRES
# under vet (§15 -- the meet is built from a fresh parse, so the
# reference is no longer spent by the schema-alone pass), and the
# distributed branch trials surface as scalar_value pairs. Evaluating
# the same two documents as one reports exactly those conflicts too,
# which is the point of ADR-007: vet and eval answer the same question.
run noplan 1 -- vet "$DIR/tenant.aon" "$DIR/data/tenant-no-plan.aon"
has noplan out '$.tenant.plan: disjunct_no_gen [incomplete]'
ok "vet: tenant without a plan is refused (disjunct_no_gen)"

# 10. Machine-readable findings carry the same codes.
run json 1 -- vet --format json "$DIR/tenant.aon" "$DIR/data/tenant-unknown-role.aon"
has json out '"code": "refer_unresolved"'
has json out '"verdict": "invalid"'
ok "vet --format json carries the registered error codes"

# ------------------------------------------------ registry proposals
# 11. The role set is exhaustive: adding a role is a closed error.
run superuser 1 -- --include-root "$DIR" "$DIR/proposals/add-superuser-role.aon"
has superuser err '[aontu/closed]'
has superuser err '$.roles.superuser'
ok "proposal: new role refused by close() (exhaustive role set)"

# 12. A hallucinated permission is refused (exit 1), AND THE REFUSAL
# NOW NAMES THE GRANT. This assertion got sharper with ADR-014, so it
# is worth saying what it used to be: the located refer_unresolved was
# unsurfaced inside the still-open Role disjunction, and what reached
# the surface was a spurious `unify_cycle` the README had to apologise
# for. Addresses being paths took the identity merge out of the picture
# and the real finding now arrives at its own position --
# `$.roles.member.grants.3`, the element the agent invented.
run halluc 1 -- --include-root "$DIR" "$DIR/proposals/extend-member-grants.aon"
has halluc err '[aontu/refer_unresolved]'
has halluc err '$.roles.member.grants.3'
ok "proposal: unknown permission still refused (diagnostic: see note)"

# 13. The wildcard rule: an unprivileged role granted admin_all dies
# on the neq() carried by the unprivileged branch's list spread.
run wildcard 1 -- --include-root "$DIR" "$DIR/proposals/member-wildcard.aon"
has wildcard err '[aontu/constraint]'
has wildcard err '$.roles.member.grants.3'
ok "proposal: member+admin_all refused by the conditional role shape"

# --------------------------------------------- same-layer invariants
# 14. The audit composition holds when the data is clean.
run audit 0 -- --include-root "$DIR" "$DIR/audits/good.aon"
ok "audit: filter+length and must() invariants pass on good data"

# 15. Exactly-one-owner: two owner members refused by filter+length.
run owners 1 -- --include-root "$DIR" "$DIR/audits/two-owners.aon"
has owners err '[aontu/constraint]'
has owners err '$.audit.exactly_one_owner'
ok "audit: two owners refused by length(1)&filter(...)"

# 16. must() fires same-layer, reporting the author's message.
run must 1 -- --include-root "$DIR" "$DIR/audits/no-mfa.aon"
has must err '[aontu/must]'
has must err "The author's message is: corporate policy CP-114: MFA is mandatory for every tenant"
ok "audit: must() failure carries the author message"

# 17. The registry invariant genuinely fires (and hide() does not
# suppress it): a two-owner registry is refused.
run reg2 1 -- "$DIR/exhibits/registry-two-owners.aon"
has reg2 err '[aontu/constraint]'
has reg2 err '$.registry_invariant.one_owner_role'
ok "registry: hidden filter+length invariant fires same-layer"

# ------------------------------- the enum-with-default idiom
# 2026-08-26: fixed by the preference admission gate (ADR-004) --
# assertions updated to the new behaviour. Checks 18-19 used to pin the
# fail-open gap (superadmin accepted, verdict valid); the idiom now
# enforces.
# 18. *member|admin|owner refuses "superadmin" (no alternative admits
# it) and still warns pref_not_instance (the advisory: the default is
# a member only by being the default).
run naive 1 -- vet "$DIR/exhibits/enum-default-naive.aon" "$DIR/data/invite-superadmin.json"
has naive out 'verdict: invalid'
has naive out '[aontu/empty]'
has naive out 'pref_not_instance'
ok "fixed: *member|admin|owner refuses superadmin, warns pref_not_instance"

# 19. The repeated branch silences the warning AND (post-gate) keeps
# exactly the same enforcement.
run repeated 1 -- vet "$DIR/exhibits/enum-default-repeated.aon" "$DIR/data/invite-superadmin.json"
has repeated out 'verdict: invalid'
has repeated out '[aontu/empty]'
hasnt repeated out 'pref_not_instance'
ok "fixed: repeated branch silences the warning and still enforces"

# 20. The repeated form still generates its default.
run repgen 0 -- "$DIR/exhibits/enum-default-repeated.aon"
has repgen out '"role": "member"'
ok "repeated form generates the default (member)"

# 21. The plain enum enforces (empty on superadmin)...
run plain 1 -- vet "$DIR/exhibits/enum-default-plain.aon" "$DIR/data/invite-superadmin.json"
has plain out 'verdict: invalid'
has plain out '[aontu/empty]'
run plainok 0 -- vet "$DIR/exhibits/enum-default-plain.aon" "$DIR/data/invite-member.aon"
# ...but no longer evaluates on its own: enforcement costs the default.
# 2026-08-27 (ADR-007): the refusal is now `disjunct_no_gen`, class
# incomplete -- "more than one alternative still admitted" -- rather
# than a scalar_value CONFLICT between the enum's own branches, which
# is what folding them together used to report.
run plaingen 1 -- "$DIR/exhibits/enum-default-plain.aon"
has plaingen err '[aontu/disjunct_no_gen]'
ok "plain enum enforces, but cannot generate a default"

# 22. The must()-guarded form enforces under vet but the conjunct
# kills the default: standalone evaluation fails (G1 phase-1 limit).
run guarded 1 -- vet "$DIR/exhibits/enum-default-guarded.aon" "$DIR/data/invite-superadmin.json"
has guarded out 'verdict: invalid'
run guardgen 0 -- "$DIR/exhibits/enum-default-guarded.aon"
has guardgen out '"role": "member"'
ok "FIXED (ADR-011): pref & must() enforces AND keeps the default"

# 23. Ranked preferences: * (team) outweighs ** (org baseline).
run rank 0 -- "$DIR/exhibits/rank-default.aon"
has rank out '"defaultRole": "member"'
ok "ranked defaults: *member beats **viewer"

# ------------------------------------------------------------ queries
# 24. get: the derived per-plan limits.
run limits 0 -- get '$.tenant.limits' "$DIR/example.aon"
diff -u "$DIR/expected/limits.json" "$WORK/limits.out" \
  || fail "get \$.tenant.limits drifted from expected/limits.json"
ok "get: match()-derived limits for the free plan"

# 25. why: provenance of the derived support tier names the match().
run why 0 -- why '$.tenant.supportTier' "$DIR/example.aon"
has why out '$.tenant.supportTier = "community"'
has why out 'match(.plan'
ok "why: supportTier provenance points at the match() in tenant.aon"

# 26. Permission-subset via subsume over set-as-map projections.
run subset 0 -- subsume "$DIR/queries/core-read.aon" "$DIR/queries/auditor-grants.aon"
has subset out 'verdict: subsumes'
run superset 1 -- subsume "$DIR/queries/auditor-grants.aon" "$DIR/queries/core-read.aon"
has superset out 'compat_required_added'
ok "subsume answers grant-subset over set-as-map projections"

# 27. OBSERVED GAP: the same grants as LISTS are order-sensitive --
# the identical set reordered does not subsume.
printf 'g: ["project_read", "member_read"]\n' > "$WORK/la.aon"
printf 'g: ["member_read", "project_read"]\n' > "$WORK/lb.aon"
run listorder 1 -- subsume "$WORK/la.aon" "$WORK/lb.aon"
has listorder out 'does_not_subsume'
ok "GAP pinned: list-shaped grant sets are order-sensitive under subsume"

# ------------------------- cross-layer folding, CLOSED 2026-08-27
# 28. A sizing atom next to a spread used to make a vet schema
# unusable: length(min(1)) refused the SCHEMA on its own, counting the
# template's empty container. A lower bound violated is provisional --
# more members may still arrive -- so the atom now residuates and the
# schema is usable (the review's finding C, BUGS.md sec 16).
printf 'x: length(min(1)) & { &: {r: integer} }\n' > "$WORK/g1.aon"
printf '{"x":{"a":{"r":1}}}\n' > "$WORK/g1.json"
run lenmin 0 -- vet "$WORK/g1.aon" "$WORK/g1.json"
has lenmin out 'verdict: valid'
ok "CLOSED: length(min)+spread schema is usable, and the data satisfies it"

# 29. ...and a satisfied-at-schema-time max no longer VANISHES: it
# stays on the value until generation, so it counts the data.
printf 'x: length(max(2)) & { &: {r: integer} }\n' > "$WORK/g2.aon"
printf '{"x":{"a":{"r":1},"b":{"r":2},"c":{"r":3}}}\n' > "$WORK/g2.json"
run lenmax 1 -- vet "$WORK/g2.aon" "$WORK/g2.json"
has lenmax out 'verdict: invalid'
has lenmax out '$.x'
ok "CLOSED: length(max(2)) refuses 3 data entries under vet"

# 30. GAP CLOSED 2026-08-27 (ADR-007): stale references under vet. A
# closed-map branch keyed on a data-supplied field via a reference used
# to pass silently, because vet met the SETTLED schema -- the
# standalone pass had already resolved `$.t.p` to `string` and replaced
# it. The meet is now built from a fresh parse, so the reference sees
# the data and the branch is selected by it. Both spellings refuse,
# with the same code, which is the invariant: vet(S,D) and eval(S u D)
# answer the same question.
printf 'Ent: type( close({ plan: "free", sso: false }) | close({ plan: "pro", sso: boolean }) )\nt: { p: string, e: $.Ent & { plan: $.t.p } }\n' > "$WORK/g3.aon"
printf '{"t":{"p":"free","e":{"sso":true}}}\n' > "$WORK/g3.json"
run stale 1 -- vet "$WORK/g3.aon" "$WORK/g3.json"
has stale out 'verdict: invalid'
has stale out '[aontu/empty]'
# The identical composition as one evaluation says the same thing:
printf '@"g3.aon"\nt: { p: "free", e: { sso: true } }\n' > "$WORK/g3e.aon"
run staleeval 1 -- "$WORK/g3e.aon"
has staleeval err '[aontu/empty]'
ok "vet catches what eval catches when a branch hangs on a reference"

# 31. CLOSED 2026-08-27 (the review's finding C, BUGS.md sec 17):
# must() used to be same-layer only -- the identical rule fired in one
# file and silently passed across vet, because a map-argument must was
# answered against the SCHEMA layer alone and discharged before the
# data arrived. A must over a container residuates with the sizing
# atoms now, and is decided at generation. Both spellings refuse, with
# the same code, which is the vet-equals-eval invariant.
printf 's: {t: integer} & must({t: max(60)}, "session too long")\n' > "$WORK/g4.aon"
printf '{"s":{"t":120}}\n' > "$WORK/g4.json"
run mustvet 1 -- vet "$WORK/g4.aon" "$WORK/g4.json"
has mustvet out 'verdict: invalid'
has mustvet out 'session too long'
printf 's: {t: integer} & must({t: max(60)}, "session too long")\ns: {t: 120}\n' > "$WORK/g5.aon"
run mustsame 1 -- "$WORK/g5.aon"
has mustsame err '[aontu/must]'
ok "CLOSED: must() vetoes both same-file and across vet, alike"

echo

# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 2 "$DIR/example.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 2 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/example.aon"
run docsvg 0 -- view doc --depth 2 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/example.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
