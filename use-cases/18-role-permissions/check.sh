#!/usr/bin/env bash
# check.sh --- drive the aontu CLI end to end over the role gate: a
# role model that says which role may change which subtree of a
# governed model, asked with `aontu allow` before every `aontu set`.
# Asserts every rule of the verb, the allow-then-set loop an agent's
# skill runs, and the refusals of a role model that does not stand up.
# Runnable from any cwd; all writes land in a temp copy of the case.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$DIR/../.."
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The loop writes an overlay, so it runs on a copy and the committed
# changes.aon is never touched.
CASE="$WORK/case"
cp -r "$DIR" "$CASE"
printf '# The agents'"'"' overlay: written by `aontu set`, never by hand.\n' \
  > "$CASE/changes.aon"

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

# get_is <path> <expected> -- the served view says this at the path.
get_is() {
  local got
  got="$($AONTU model get "$1" "$CASE/system.aon" 2>/dev/null)"
  [ "$got" = "$2" ] || fail "get $1: expected $2, got $got"
}

# propose <name> <role> <path=value> -- the skill's loop, in shell:
# ask the gate with the very argument `set` will get, and run `set`
# only when the answer is exit 0. The gate's report lands in
# $WORK/<name>.out and its exit code in $WORK/<name>.gate; when the
# write ran, its report is $WORK/<name>.set and its exit code
# $WORK/<name>.setexit. A refused proposal leaves no .set file at all.
propose() {
  local name="$1" role="$2" change="$3" got=0
  $AONTU allow --role "$role" "$CASE/roles.aon" "$change" \
    >"$WORK/$name.out" 2>"$WORK/$name.err" || got=$?
  echo "$got" >"$WORK/$name.gate"
  if [ "$got" -eq 0 ]; then
    got=0
    $AONTU model set "$change" --entry "$CASE/model.aon" \
      --overlay "$CASE/changes.aon" >"$WORK/$name.set" 2>&1 || got=$?
    echo "$got" >"$WORK/$name.setexit"
  fi
}

# gate <name> <exit> -- the gate answered with this exit code.
gate() {
  [ "$(cat "$WORK/$1.gate")" -eq "$2" ] \
    || { cat "$WORK/$1.out" "$WORK/$1.err" >&2; fail "$1: gate exit $(cat "$WORK/$1.gate"), wanted $2"; }
}

# landed <name> -- the gate said yes, set ran, and the change holds.
landed() {
  gate "$1" 0
  [ -f "$WORK/$1.set" ] || fail "$1: allowed, but set never ran"
  [ "$(cat "$WORK/$1.setexit")" -eq 0 ] \
    || { cat "$WORK/$1.set" >&2; fail "$1: set exit $(cat "$WORK/$1.setexit"), wanted 0"; }
  has "$1" set 'verdict: valid'
}

# blocked <name> -- the gate said no, and set was never run.
blocked() {
  gate "$1" 1
  [ ! -f "$WORK/$1.set" ] || fail "$1: refused by the gate, yet set ran"
}

# ---------------------------------------------------------------- model
# 1. The governed model evaluates to its golden: every value a role may
# change is a default, so the model itself accepts a change to any of
# them. The role model evaluates too, and the type()-marked vocabulary
# stays out of both.
run model 0 -- "$DIR/model.aon"
diff -u "$DIR/expected/model.json" "$WORK/model.out" \
  || fail "model.aon output drifted from expected/model.json"
hasnt model out '"Service"'
run roles 0 -- "$DIR/roles.aon"
diff -u "$DIR/expected/roles.json" "$WORK/roles.out" \
  || fail "roles.aon output drifted from expected/roles.json"
hasnt roles out '"Role"'
ok "model.aon and roles.aon evaluate to their goldens; the vocabularies stay out"

# ------------------------------------------------- the rules of allow
# 2. An allow entry covers itself and everything below it.
run at 0 -- allow --role product "$DIR/roles.aon" '$.features'
has at out 'verdict: allowed'
has at out '$.features: allowed by $.roles.product.allow.0 ($.features)'
run below 0 -- allow --role product "$DIR/roles.aon" '$.features.checkout_v2'
has below out '$.features.checkout_v2: allowed by $.roles.product.allow.0 ($.features)'
run deep 0 -- allow --role qa "$DIR/roles.aon" '$.tests.smoke.timeout'
has deep out '$.tests.smoke.timeout: allowed by $.roles.qa.allow.0 ($.tests)'
ok "an allow entry covers itself and everything below it"

# 3. ...and never the map above it: a change there reaches every
# sibling too. Only an entry that names the root covers the root.
run above 1 -- allow --role product "$DIR/roles.aon" '$.services'
has above out 'verdict: refused'
has above out '$.services: refused (no allow entry of product covers it)'
run root 1 -- allow --role qa "$DIR/roles.aon" '$'
has root out '$: refused (no allow entry of qa covers it)'
run admin 0 -- allow --role admin "$DIR/roles.aon" '$' '$.services.auth.tier'
has admin out '$: allowed by $.roles.admin.allow.0 ($)'
has admin out '$.services.auth.tier: allowed by $.roles.admin.allow.0 ($)'
ok "an allow entry never covers the map above it; only \$ covers \$"

# 4. `*` matches exactly one key: any region's replica map, and what
# is below it, but not the region itself and not the canary's map two
# keys down.
run star 0 -- allow --role dev "$DIR/roles.aon" \
  '$.deploy.eu1.replicas' '$.deploy.us1.replicas.search'
has star out '$.deploy.eu1.replicas: allowed by $.roles.dev.allow.1 ($.deploy.*.replicas)'
has star out '$.deploy.us1.replicas.search: allowed by $.roles.dev.allow.1 ($.deploy.*.replicas)'
run starabove 1 -- allow --role dev "$DIR/roles.aon" '$.deploy.eu1' '$.deploy'
has starabove out '$.deploy.eu1: refused (no allow entry of dev covers it)'
has starabove out '$.deploy: refused (no allow entry of dev covers it)'
run startwo 1 -- allow --role dev "$DIR/roles.aon" '$.deploy.eu1.canary.replicas.search'
has startwo out '$.deploy.eu1.canary.replicas.search: refused (no allow entry of dev covers it)'
ok "* matches exactly one key: the region's replicas, not the region, not the canary's"

# 5. A deny entry refuses every path that intersects it: the denied
# node, everything above it (a change there could rewrite it), and
# everything below it. A sibling is untouched. The gate reads the role
# model alone and never opens model.aon, so a path the model does not
# have (the tier has no `level`) is answered the same way.
run denyat 1 -- allow --role dev "$DIR/roles.aon" '$.services.auth.tier'
has denyat out '$.services.auth.tier: refused by $.roles.dev.deny.0 ($.services.*.tier)'
run denyabove 1 -- allow --role dev "$DIR/roles.aon" '$.services.auth' '$.services' '$'
has denyabove out '$.services.auth: refused by $.roles.dev.deny.0 ($.services.*.tier)'
has denyabove out '$.services: refused by $.roles.dev.deny.0 ($.services.*.tier)'
has denyabove out '$: refused by $.roles.dev.deny.0 ($.services.*.tier)'
run denybelow 1 -- allow --role dev "$DIR/roles.aon" '$.services.auth.tier.level'
has denybelow out '$.services.auth.tier.level: refused by $.roles.dev.deny.0 ($.services.*.tier)'
run denyowner 1 -- allow --role dev "$DIR/roles.aon" '$.services.billing.owner'
has denyowner out '$.services.billing.owner: refused by $.roles.dev.deny.1 ($.services.*.owner)'
run beside 0 -- allow --role dev "$DIR/roles.aon" '$.services.auth.replicas'
has beside out '$.services.auth.replicas: allowed by $.roles.dev.allow.0 ($.services)'
ok "a deny entry refuses the node, the maps above it and the paths below it; a sibling is untouched"

# 6. Deny wins over allow whatever the order. dev's tier sits inside
# $.services, which allow.0 covers, and is refused all the same; a
# model with the deny written before the allow answers the same.
printf 'roles: r: { deny: ["$.a.b"] allow: ["$.a"] }\n' > "$WORK/order.aon"
run order 1 -- allow --role r "$WORK/order.aon" '$.a.b' '$.a.c'
has order out '$.a.b: refused by $.roles.r.deny.0 ($.a.b)'
has order out '$.a.c: allowed by $.roles.r.allow.0 ($.a)'
ok "deny beats allow whatever the order the entries were written in"

# 7. A path no entry reaches is refused as uncovered, and a role with
# no allow list allows nothing: the shape's empty list is what
# generates for it.
run uncovered 1 -- allow --role product "$DIR/roles.aon" '$.services.auth.replicas'
has uncovered out '$.services.auth.replicas: refused (no allow entry of product covers it)'
printf 'roles: r: {}\n' > "$WORK/noallow.aon"
run noallow 1 -- allow --role r "$WORK/noallow.aon" '$.a'
has noallow out '$.a: refused (no allow entry of r covers it)'
ok "uncovered paths are refused; a role with no allow list allows nothing"

# 8. An undeclared role may change nothing: exit 1, with a no_path
# finding at the role's path, and the nearest declared name when one
# is close.
run ops 1 -- allow --role ops "$DIR/roles.aon" '$.features.dark_mode'
diff -u "$DIR/expected/allow-ops.txt" "$WORK/ops.out" \
  || fail "the undeclared-role report drifted from expected/allow-ops.txt"
has ops out '$.roles.ops: no_path [reference]'
run near 1 -- allow --role deve "$DIR/roles.aon" '$.services'
has near out '$.services: refused (role deve is not declared)'
has near out 'note: did you mean dev?'
ok "an undeclared role is refused with a no_path finding and the nearest name"

# 9. The assignment spelling: the gate takes the very argument `set`
# will get. The value must be one value -- `set` appends it as source,
# so a second pair inside it would write a subtree the gate was never
# asked about -- and is otherwise not the gate's business.
run assign 0 -- allow --role product "$DIR/roles.aon" \
  '$.services.auth.description="Sign-in, sessions and MFA"'
has assign out '$.services.auth.description: allowed by $.roles.product.allow.1 ($.services.*.description)'
run smuggle 2 -- allow --role product "$DIR/roles.aon" \
  '$.services.auth.description="ok" services: auth: tier: "critical"'
has smuggle err 'the value of $.services.auth.description is not one value'
ok "a path in set's assignment spelling is accepted, and a value that carries a second pair is refused"

# 10. The text report, one line per asked path, with the verdict
# refused as soon as one of them is.
run devtext 1 -- allow --role dev "$DIR/roles.aon" '$.services.auth.replicas' \
  '$.deploy.eu1.replicas.search' '$.services.auth.tier' '$.services.billing' \
  '$.features.dark_mode'
diff -u "$DIR/expected/allow-dev.txt" "$WORK/devtext.out" \
  || fail "the text report drifted from expected/allow-dev.txt"
ok "the text report answers every path and names the deciding entry"

# 11. The same report as JSON. The producer block carries the CLI
# version, so the golden is compared without that line.
run qajson 1 -- allow --role qa --format json "$DIR/roles.aon" '$.tests.smoke' '$.services'
diff -u <(grep -v '"version"' "$DIR/expected/allow-qa.json") \
        <(grep -v '"version"' "$WORK/qajson.out") \
  || fail "the JSON report drifted from expected/allow-qa.json"
has qajson out '"verb": "allow"'
has qajson out '"reason": "uncovered"'
ok "--format json carries verdict, role, paths and the producer"

# 12. --at moves the roles map: policy.aon keeps its roles under
# $.policy.roles, the deciding entry is named under that anchor, and
# asked without --at the gate looks at $.roles and finds no role.
run at1 1 -- allow --role dev --at '$.policy.roles' "$DIR/policy.aon" \
  '$.services.auth.replicas' '$.services.auth.tier'
has at1 out '$.services.auth.replicas: allowed by $.policy.roles.dev.allow.0 ($.services)'
has at1 out '$.services.auth.tier: refused by $.policy.roles.dev.deny.0 ($.services.*.tier)'
run at2 0 -- allow --role release --at '$.policy.roles' "$DIR/policy.aon" '$.deploy.eu1'
has at2 out '$.deploy.eu1: allowed by $.policy.roles.release.allow.0 ($.deploy)'
run at3 1 -- allow --role dev "$DIR/policy.aon" '$.services.auth.replicas'
has at3 out '$.services.auth.replicas: refused (role dev is not declared)'
has at3 out '$.roles.dev: no_path [reference]'
ok "--at reads the roles map where the policy keeps it, and nowhere else"

# ------------------------------------------- the allow-then-set loop
# 13. An allowed change lands: the gate says yes, set writes the
# overlay, the served view shows the value, and why attributes it to
# the overlay line over the model's default.
propose dev-replicas dev '$.services.auth.replicas=5'
landed dev-replicas
has dev-replicas out '$.services.auth.replicas: allowed by $.roles.dev.allow.0 ($.services)'
grep -qF '"services": "auth": "replicas": 5' "$CASE/changes.aon" \
  || fail "the allowed change did not reach the overlay"
get_is '$.services.auth.replicas' '5'
run whyval 0 -- model why '$.services.auth.replicas' "$CASE/system.aon"
has whyval out '$.services.auth.replicas = 5'
has whyval out 'changes.aon:2:33'
has whyval out '*3'
has whyval out '(pref)'
ok "an allowed change lands in the overlay, and the served view and why show it"

# 14. A refused change never reaches set. The model has nothing
# against a new tier (a dry run of the same write is valid); the role
# does, and the overlay and the served view are untouched.
propose dev-tier dev '$.services.auth.tier="standard"'
blocked dev-tier
has dev-tier out '$.services.auth.tier: refused by $.roles.dev.deny.0 ($.services.*.tier)'
grep -q 'tier' "$CASE/changes.aon" && fail "a refused change reached the overlay" || true
get_is '$.services.auth.tier' '"critical"'
run dry 0 -- model set '$.services.auth.tier="standard"' --entry "$CASE/model.aon" \
  --overlay "$CASE/changes.aon" --dry-run
has dry out 'verdict: valid'
has dry out '(dry run)'
ok "a refused change never reaches set, though the model alone would take it"

# 15. The other roles run the same loop: product's description (in
# the assignment spelling) and qa's timeout land; dev's change under
# the star entry lands; product asking for a replica count is
# uncovered, and an undeclared role is refused, and neither reaches set.
propose product-desc product '$.services.auth.description="Sign-in, sessions and MFA"'
landed product-desc
get_is '$.services.auth.description' '"Sign-in, sessions and MFA"'
propose qa-timeout qa '$.tests.smoke.timeout=60'
landed qa-timeout
get_is '$.tests.smoke.timeout' '60'
propose dev-region dev '$.deploy.eu1.replicas.search=6'
landed dev-region
get_is '$.deploy.eu1.replicas.search' '6'
propose product-replicas product '$.services.auth.replicas=9'
blocked product-replicas
has product-replicas out '$.services.auth.replicas: refused (no allow entry of product covers it)'
propose ops-flag ops '$.features.dark_mode=false'
blocked ops-flag
has ops-flag out '$.roles.ops: no_path [reference]'
get_is '$.services.auth.replicas' '5'
get_is '$.features.dark_mode' 'true'
ok "product, qa and dev land their changes; an uncovered path and an undeclared role reach nothing"

# 16. The gate says who, the model says what. admin may change
# anything, and set still refuses a key the Service vocabulary does not
# declare; dev may change a region's replicas, and set still refuses a
# count below min(1). Neither lands.
propose admin-colour admin '$.services.auth.colour="blue"'
gate admin-colour 0
has admin-colour out '$.services.auth.colour: allowed by $.roles.admin.allow.0 ($)'
[ "$(cat "$WORK/admin-colour.setexit")" -eq 1 ] || fail "set accepted an undeclared key"
has admin-colour set '[aontu/closed]'
has admin-colour set '$.services.auth.colour'
propose dev-zero dev '$.deploy.us1.replicas.auth=0'
gate dev-zero 0
[ "$(cat "$WORK/dev-zero.setexit")" -eq 1 ] || fail "set accepted a replica count of 0"
has dev-zero set '[aontu/constraint]'
has dev-zero set 'expected: min(1)'
grep -q 'colour' "$CASE/changes.aon" && fail "the undeclared key reached the overlay" || true
grep -q '"auth": 0' "$CASE/changes.aon" && fail "the zero count reached the overlay" || true
ok "a change the gate allows is still held to the model: closed keys and min(1) refuse"

# 17. The served view after the loop matches its golden, and the
# overlay carries exactly the four allowed lines.
run system 0 -- "$CASE/system.aon"
diff -u "$DIR/expected/system.json" "$WORK/system.out" \
  || fail "the served view after the loop drifted from expected/system.json"
[ "$(grep -c '^"' "$CASE/changes.aon")" -eq 4 ] \
  || { cat "$CASE/changes.aon" >&2; fail "the overlay does not hold exactly four lines"; }
ok "the served view after the loop matches expected/system.json; four overlay lines"

# ----------------------------------------- a role model that breaks
# 18. A role model that does not stand up decides nothing: verdict
# error, exit 4, the engine's own code and site. A key the vocabulary
# does not declare and a fifth role are [aontu/closed]; an allow list
# written as a string is [aontu/list]; a close()d vocabulary that
# forgets deny? refuses the shape itself.
run badkey 4 -- allow --include-root "$DIR" --role dev \
  "$DIR/proposals/role-unknown-key.aon" '$.services.auth.replicas'
has badkey out 'verdict: error'
has badkey out '[aontu/closed]'
has badkey out '$.roles.dev.scope'
hasnt badkey out '$.services.auth.replicas:'
run badlist 4 -- allow --include-root "$DIR" --role dev \
  "$DIR/proposals/role-allow-string.aon" '$.services.auth.replicas'
has badlist out 'verdict: error'
has badlist out '[aontu/list]'
has badlist out '$.roles.qa.allow'
run badrole 4 -- allow --include-root "$DIR" --role dev \
  "$DIR/proposals/add-undeclared-role.aon" '$.services.auth.replicas'
has badrole out 'verdict: error'
has badrole out '[aontu/closed]'
has badrole out '$.roles.ops'
printf 'Role: type(close({ desc: string allow: [&: string] }))\nroles: close({ &: $.Role dev: { desc: "x" allow: ["$.services"] } })\n' \
  > "$WORK/nodeny.aon"
run nodeny 4 -- allow --role dev "$WORK/nodeny.aon" '$.services.auth'
has nodeny out 'verdict: error'
has nodeny out '[aontu/closed]'
has nodeny out 'deny'
ok "a broken role model is exit 4 with the engine's own finding; no path is decided"

# 19. The deciding entry is a path into the role model, so why names
# the file and the line that wrote the rule. The position is pinned:
# an edit that moves the dev deny list moves it.
run why 0 -- model why '$.roles.dev.deny.0' "$DIR/roles.aon"
has why out '$.roles.dev.deny.0 = "$.services.*.tier"'
has why out 'roles.aon:20:12'
ok "why on the deciding entry names roles.aon and the line"

echo

# THE MODEL TREE. The shape of the governed document, drawn by the one
# kind that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 2 "$DIR/model.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 2 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/model.aon"
run docsvg 0 -- view doc --depth 2 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/model.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
