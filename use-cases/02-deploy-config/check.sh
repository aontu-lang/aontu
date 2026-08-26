#!/usr/bin/env bash
# End-to-end validation of the multi-environment deployment-config use
# case.  Drives the real aontu CLI: build, goldens, layer attribution,
# guardrail vets, agent-candidate vets, expected failures (asserted by
# exit code + error code, never by error prose), and the `set` verb.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aontu() { $AONTU "$@"; }
strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }

PASS=0
ok() { PASS=$((PASS + 1)); echo "ok $PASS - $1"; }
die() { echo "FAIL - $1" >&2; exit 1; }

# run NAME EXPECTED_EXIT ARGS... : capture combined output (ANSI
# stripped) in $TMP/NAME.out and assert the exit code.
run() {
  local name="$1" want="$2"; shift 2
  local got=0
  set +e
  $AONTU "$@" 2>&1 | strip_ansi > "$TMP/$name.out"
  got="${PIPESTATUS[0]}"
  set -e
  [ "$got" = "$want" ] || {
    sed 's/^/    /' "$TMP/$name.out" >&2
    die "$name: expected exit $want, got $got"
  }
}

has() { # has NAME PATTERN LABEL
  grep -qF -- "$2" "$TMP/$1.out" || {
    sed 's/^/    /' "$TMP/$1.out" >&2
    die "$1: missing '$2' ($3)"
  }
}

# ---------------------------------------------------------------- build
run build 0 "$DIR/stack.aon"
diff -u "$DIR/expected/stack.json" "$TMP/build.out" \
  || die "built output differs from expected/stack.json"
ok "build matches golden (4 layers, 3 envs, 4 services)"

run canon 0 --canon "$DIR/stack.aon"
diff -u "$DIR/expected/stack.canon.txt" "$TMP/canon.out" \
  || die "canonical form differs from expected/stack.canon.txt"
ok "canonical form matches golden (defaults and spreads preserved)"

# ------------------------------------------------- resolved layer values
get_is() { # path expected label
  local got
  got="$(aontu get "$1" "$DIR/stack.aon")"
  [ "$got" = "$2" ] || die "get $1: expected $2, got $got"
  ok "$3"
}
get_is '$.deploy.prod.workloads.billing.replicas' '12' \
  "prod billing: concrete service pin beats env default"
get_is '$.deploy.prod.workloads.web.replicas' '4' \
  "prod web: env * default applies where no pin exists"
get_is '$.deploy.dev.workloads.web.replicas' '1' \
  "dev web: dev env * default applies"
get_is '$.deploy.dev.workloads.web.logLevel' '"debug"' \
  "dev logLevel: team ** beats org *** (lowest rank wins)"
get_is '$.deploy.prod.workloads.web.logLevel' '"warn"' \
  "prod logLevel: env * beats team ** and org ***"
get_is '$.deploy.prod.workloads.auth.logLevel' '"info"' \
  "prod auth logLevel: concrete pin beats every rank"
get_is '$.deploy.staging.workloads.web.tracing' 'true' \
  "staging tracing: team ** default survives (no env override)"
get_is '$.deploy.prod.workloads.web.tracing' 'false' \
  "prod tracing: concrete env mandate"
get_is '$.rollout.billingProdMaxSurge' '13' \
  "surge = replicas + 1 works from a concrete pin (outside pack)"
get_is '$.alerts.billing.runbook' '"https://runbooks.acme.internal/billing"' \
  "filter(critical) -> pack: paging route generated from catalog"

# ---------------------------------------------------------- attribution
run why-defs 0 why '$.defs.workload.logLevel' "$DIR/stack.aon"
has why-defs 'org-policy.aon' "org layer attributed"
has why-defs 'team-defaults.aon' "team layer attributed"
has why-defs '***"info"|string' "org rank shown"
has why-defs '**"debug"|string' "team rank shown"
ok "why attributes the schema row to both layers with file:line"

run why-billing 0 why '$.deploy.prod.workloads.billing.replicas' "$DIR/stack.aon"
has why-billing 'envs/prod.aon' "prod overlay attributed"
has why-billing '12' "pin value shown"
ok "why attributes the prod pin to envs/prod.aon"

# Pinned observation (README, gap 3): why cannot see contributions that
# arrive through a pack() clone -- the org/team layers are invisible at
# a generated workload path.
run why-blind 0 why '$.deploy.dev.workloads.web.logLevel' "$DIR/stack.aon"
has why-blind 'no contributions' "pack clones are unattributed"
ok "pinned: why is blind through pack (gap 3)"

# ------------------------------------------------------------ guardrails
run vet-guard 0 vet "$DIR/guardrails.aon" "$DIR/expected/stack.json"
has vet-guard 'verdict: valid' "guardrail verdict"
ok "vet guardrails over built output: valid"

# ------------------------------------------- agent-emitted change gates
run vet-good 0 vet "$DIR/request-schema.aon" "$DIR/data/rollout-good.json"
has vet-good 'verdict: valid' "good candidate verdict"
ok "agent candidate within policy: valid"

run vet-bad 1 vet "$DIR/request-schema.aon" "$DIR/data/rollout-bad.json"
has vet-bad '[aontu/constraint]' "constraint code"
has vet-bad 'max(24)' "replica bound named"
has vet-bad '$.service' "bad service name flagged"
has vet-bad '$.reason' "thin rationale flagged (length atom)"
ok "agent candidate out of bounds: 3 located constraint findings"

run vet-unknown 1 vet "$DIR/request-schema.aon" "$DIR/data/rollout-unknown-key.json"
has vet-unknown '[aontu/closed]' "closed code"
has vet-unknown '$.forceRestart' "hallucinated key flagged"
ok "agent candidate with hallucinated key: refused by close()"

run vet-json 1 vet --format json "$DIR/request-schema.aon" "$DIR/data/rollout-bad.json"
has vet-json '"code": "constraint"' "machine-readable finding"
ok "vet --format json emits machine-readable findings"

# ------------------------------------------------------- probe: ranking
run rank 0 "$DIR/probes/rank-ladder.aon"
diff -u "$DIR/expected/rank-ladder.json" "$TMP/rank.out" \
  || die "rank-ladder output differs"
ok "rank ladder golden: * beats ** beats ***, concrete beats all"

run equal-rank 1 "$DIR/probes/equal-rank.aon"
has equal-rank '[aontu/scalar_value]' "equal-rank conflict code"
ok "two disagreeing defaults of equal rank are a conflict"

# ------------------------------------------------ probe: layer conflict
run conflict 1 "$DIR/probes/conflict.aon"
has conflict '[aontu/scalar_value]' "conflict code"
has conflict '$.deploy.prod.workloads.billing.replicas' "conflict path"
has conflict 'conflict-capacity.aon' "first layer named"
has conflict 'conflict-costcut.aon' "second layer named"
ok "cross-file conflict names both contributing files"

# ------------------------------------------------- probe: sealed shapes
run typo 1 "$DIR/probes/typo-overlay.aon"
has typo '[aontu/closed]' "closed code"
has typo '$.deploy.prod.workloads.auth.replcas' "typo path reported"
ok "misspelt overlay key refused by close()d workload shape"

run env-typo 1 "$DIR/probes/env-typo.aon"
has env-typo '[aontu/closed]' "closed code"
has env-typo '$.envguard' "guard path"
has env-typo 'prod2' "offending env named"
ok "unknown environment refused by hidden envguard"

# ---------------------------------------------- probe: no key deletion
run remove 1 "$DIR/probes/remove-key.aon"
has remove '[aontu/scalar_kind]' "kind-conflict code"
ok "a layer cannot remove a lower layer's key (null conflicts)"

# -------------------------------------------------- probe: arithmetic
run multiply 1 "$DIR/probes/multiply.aon"
has multiply '[aontu/unexpected]' "parse-error code"
has multiply 'unexpected character(s): *' "star rejected"
ok "replicas * 2 is a parse error ('+' is the only operator)"

run surge-default 1 "$DIR/probes/surge-from-default.aon"
has surge-default '[aontu/mapval_no_gen]' "no-gen code"
ok "replicas + 1 fails against a defaulted (*N | integer) operand"

# ------------------------------ probe: two spreads on one map cross-wire
run crosswire 1 vet "$DIR/probes/spread-crosswire.aon" "$DIR/expected/stack.json"
has crosswire '$.deploy.prod.workloads.billing.port' "bogus sibling conflict path"
has crosswire '8082' "billing's own port"
has crosswire '8081' "auth's port leaked into billing"
ok "pinned: stacked spreads cross-wire sibling children in vet (gap 6)"

# --------------------------------------------- probe: must with message
run must-floor 1 "$DIR/probes/must-floor.aon"
has must-floor '[aontu/must]' "must code"
has must-floor 'zero-downtime rollouts' "author message surfaced"
ok "must() fires with the author's own message"

# -------------------------------- probe: defaults vs constraint atoms
run lost-default 1 "$DIR/probes/lost-default.aon"
has lost-default '[aontu/mapval_no_gen]' "no-gen code"
has lost-default 'min(1)&max(24)' "unresolved residual shown"
ok "pinned: constraint conjunct swallows a ranked default (gap 1)"

# 2026-08-26: fixed by the preference admission gate (ADR-004) -- the
# out-of-range override is now refused instead of accepted (gap 2 was
# the fail-open evidence; the golden expected/bypassed-bound.json with
# replicas:40 is gone with it).
run bypassed 1 "$DIR/probes/bypassed-bound.aon"
has bypassed '[aontu/|:empty]' "empty-disjunction refusal"
ok "fixed: override outside the disjoined bound refused, exit 1 (gap 2)"

# ------------------------------------- probe: close(pack) + overlay bug
run absorb 0 "$DIR/probes/close-pack-absorb.aon"
diff -u "$DIR/expected/close-pack-absorb.json" "$TMP/absorb.out" \
  || die "close-pack-absorb output differs"
ok "pinned: close(pack(.., _ & t)) absorbs overlays, exit 0 (gap 5)"

# --------------------------------------------- the set verb (agent edit)
WORK="$TMP/work"
cp -R "$DIR" "$WORK"
rm -f "$WORK/check.sh"
printf '# written by the release agent via aontu set\n' > "$WORK/agent-change.aon"

set +e
$AONTU set '$.deploy.prod.workloads.web.replicas=8' \
  --entry "$WORK/stack.aon" --overlay "$WORK/agent-change.aon" \
  2>&1 | strip_ansi > "$TMP/set-ok.out"
SET_OK="${PIPESTATUS[0]}"
set -e
[ "$SET_OK" = "0" ] || { cat "$TMP/set-ok.out" >&2; die "set (valid) failed"; }
has set-ok 'verdict: valid' "set vets before writing"
has set-ok 'wrote:' "overlay written"
printf '@"stack.aon"\n@"agent-change.aon"\n' > "$WORK/with-change.aon"
GOT="$(aontu get '$.deploy.prod.workloads.web.replicas' "$WORK/with-change.aon")"
[ "$GOT" = "8" ] || die "set change not visible on re-evaluation (got $GOT)"
ok "set: agent override of a default is vetted, written, effective"

set +e
$AONTU set '$.deploy.prod.workloads.billing.replicas=14' \
  --entry "$WORK/stack.aon" --overlay "$WORK/agent-refused.aon" \
  2>&1 | strip_ansi > "$TMP/set-bad.out"
SET_BAD="${PIPESTATUS[0]}"
set -e
[ "$SET_BAD" = "1" ] || { cat "$TMP/set-bad.out" >&2; die "set (conflicting) did not refuse"; }
has set-bad '[aontu/scalar_value]' "refusal is a located conflict"
[ ! -e "$WORK/agent-refused.aon" ] \
  || die "refused set still wrote the overlay file"
ok "set: agent change conflicting with a pinned value refused, no write"

echo "all $PASS checks passed"
