#!/usr/bin/env bash
# End-to-end validation of the k8s golden-path use case.  Drives the
# real aontu CLI: manifest generation vs golden, override composition,
# guardrail vets over rendered output, agent onboarding-candidate vets,
# the column drift guard, and the pinned probes (expected failures are
# asserted by exit code + error code, never by error prose; pinned
# silent-wrong-answer bugs are asserted by golden diff).
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
run build 0 "$DIR/main.aon"
diff -u "$DIR/expected/manifests.json" "$TMP/build.out" \
  || die "rendered manifests differ from expected/manifests.json"
ok "3 services fan out to 3 Deployments + 3 Services, inputs hidden"

# ------------------------------------------------- resolved spot values
get_is() { # path expected label
  local got
  got="$(aontu get "$1" "$DIR/main.aon")"
  [ "$got" = "$2" ] || die "get $1: expected $2, got $got"
  ok "$3"
}
get_is '$.deploy.billing.spec.replicas' '6' \
  "billing replicas: override beats the *2 default"
get_is '$.deploy.web.spec.replicas' '2' \
  "web replicas: golden-path default applies untouched"
get_is '$.deploy.web.spec.template.spec.containers.0.resources.limits.cpu' '"750m"' \
  "web cpu limit: one-field override on the tier block"
get_is '$.deploy.web.spec.template.spec.containers.0.resources.limits.memory' '"512Mi"' \
  "web memory limit: sibling tier default survives the override"
get_is '$.deploy.billing.spec.template.spec.containers.0.resources.requests.cpu' '"1000m"' \
  "billing cpu request: match() picked the large tier"
get_is '$.deploy.billing.spec.template.spec.containers.0.image' '"registry.acme.io/payments/billing:2.0.0"' \
  "billing image: registry + key(6) + version column concatenated"
get_is '$.service.auth.spec.ports.0.port' '9090' \
  "auth Service: grpc port generated from the shared ports column"
get_is '$.deploy.auth.metadata.name' '"auth"' \
  "metadata.name from key(2) inside the pack template"

# env pipeline: base map + per-service merge + injected OTEL name
ENV_JSON="$(aontu get '$.deploy.billing.spec.template.spec.containers.0.env' "$DIR/main.aon")"
echo "$ENV_JSON" | grep -q '"value": "debug"' \
  || die "billing LOG_LEVEL: extraEnv map-level override missing"
echo "$ENV_JSON" | grep -q '"value": "billing"' \
  || die "billing OTEL_SERVICE_NAME: per-service injection missing"
ok "env list: map-level merge (debug beats *info) + per-service OTEL name"

# ------------------------------------------------------------ guardrails
run vet-good 0 vet "$DIR/guardrails.aon" "$DIR/expected/manifests.json"
has vet-good 'verdict: valid' "guardrail verdict"
ok "vet guardrails over rendered manifests: valid"

run vet-tampered 1 vet "$DIR/guardrails.aon" "$DIR/data/manifests-tampered.json"
has vet-tampered '[aontu/constraint]' "constraint code"
has vet-tampered 'max(20)' "replica cap named"
has vet-tampered 'replicas' "replica finding located"
has vet-tampered 'memory' "unit-less quantity flagged by re()"
# 2026-08-26 (template-clone isolation, ADR-005): the finding path is
# now `...containers.0.env.name` — identical in BOTH ports (the TS
# path previously said env.0.name but dropped `web`; the ports
# disagreed). The element index inside env is still elided — a
# site-attribution gap, open, tracked with use-case 03's gap 8.
has vet-tampered 'env.name' "env-name finding located at its path"
has vet-tampered 'log_level' "lowercase env name is the named offender"
ok "tampered manifests: replicas 50, lowercase env, unit-less memory all caught"

run vet-unknown 1 vet --closed "$DIR/guardrails.aon" "$DIR/data/manifests-unknown-key.json"
has vet-unknown '[aontu/closed]' "closed code"
has vet-unknown 'containers.0' "hallucinated container key located"
ok "hallucinated container key refused by closed shape"

# ------------------------------------------- agent onboarding candidates
run onboard-good 0 vet "$DIR/request-schema.aon" "$DIR/data/onboard-good.json"
has onboard-good 'verdict: valid' "good candidate"
ok "agent onboarding candidate within policy: valid"

run onboard-bad 1 vet "$DIR/request-schema.aon" "$DIR/data/onboard-bad.json"
has onboard-bad '[aontu/constraint]' "constraint findings"
has onboard-bad '$.service' "bad name flagged (portable-subset DNS-1123)"
has onboard-bad '[aontu/|:empty]' "tier outside the enum"
has onboard-bad '$.forceDeploy' "hallucinated key flagged"
has onboard-bad '[aontu/closed]' "closed code"
ok "bad candidate: name, version, tier, port, reason, extra key all located"

run onboard-json 1 vet --format json "$DIR/request-schema.aon" "$DIR/data/onboard-bad.json"
has onboard-json '"code": "constraint"' "machine-readable finding"
ok "vet --format json emits machine-readable findings"

# ------------------------------------------------- column drift guard
printf '@"%s/main.aon"\nsvc: version: "ghost-svc": "9.9.9"\n' "$DIR" > "$TMP/ghost.aon"
run ghost 1 "$TMP/ghost.aon"
has ghost '[aontu/closed]' "closed code"
has ghost '$.deploy.ghost-svc' "rogue column entry located"
ok "drift guard: a version-column entry with no service is refused"

# ================================================================ probes
# Expected failures: exit code + error code.
probe_fails() { # file code label
  run "p-$1" 1 "$DIR/probes/$1.aon"
  has "p-$1" "$2" "error code"
  ok "probe $1: $3"
}
probe_fails multiply '[aontu/unexpected]' \
  "replicas * 2 is not even lexable ('+' is the only operator)"
probe_fails double-from-default '[aontu/mapval_no_gen]' \
  "x + x doubling fails against a defaulted operand"
probe_fails default-with-bounds '[aontu/mapval_no_gen]' \
  "a ranked default and min/max cannot share a field"
# 2026-08-26: fixed by the template-clone isolation change (ADR-005) —
# the relative ref in the template EXPRESSION now answers for the
# child (was [aontu/no_path] at a NaN key), so this moved from the
# expected-failure probes to the goldens below. Shared-spec pin:
# test/spec/gen-pack.tsv pack-rel-ref-in-expr.
probe_fails hole-member-access '[aontu/no_path]' \
  "_.field projection is unspellable"
has p-hole-member-access 'unspellable' "unspellable in diagnostic"
probe_fails each-reshape-scalar '[aontu/scalar_kind]' \
  "each cannot reshape scalar children into maps"
probe_fails join-list '[aontu/mapval_no_gen]' \
  "no join(): list + string does not evaluate"
probe_fails spread-column-deadlock '[aontu/mapval_no_gen]' \
  "pack over spread-augmented data never settles"
probe_fails length-on-schema-list '[aontu/constraint]' \
  "length(min(1)) fires on the empty schema list before the merge"
probe_fails env-append '[aontu/scalar_value]' \
  "appending to a generated list collides positionally"
probe_fails kebab-bare '[aontu/negative]' \
  "bare kebab-case name parses as negation"

# Pinned silent-wrong-answer bugs: exit 0, golden diff.
probe_golden() { # file label
  run "g-$1" 0 "$DIR/probes/$1.aon"
  diff -u "$DIR/expected/$1.json" "$TMP/g-$1.out" \
    || die "probe $1 output differs from expected/$1.json"
  ok "pinned $2"
}
# 2026-08-26: fixed by the preference admission gate (ADR-004) -- the
# out-of-bound override is refused now, so this moved from the
# silent-wrong-answer goldens to the refusal probes (the golden
# expected/bound-bypass.json, replicas:40, is gone with it).
probe_fails bound-bypass '[aontu/|:empty]' \
  "bound in a disjunction branch: override 40 refused by the admission gate"
probe_golden close-shallow-typo \
  "close(pack) does not seal children: typo'd override absorbed, exit 0"
grep -q '"replcias": 4' "$DIR/expected/close-shallow-typo.json" \
  || die "close-shallow-typo golden lost its point"
# 2026-08-26: the next four goldens hold the CORRECT outputs — fixed by
# the template-clone isolation change (ADR-005). They pinned
# silent-wrong answers before (both children named "web", shared
# rank-2 key(), empty hidden-pack children, no_path on the template
# expression ref).
probe_golden ref-in-pack-template \
  "fixed: relative ref in a template expression answers for the child"
grep -q '"250m"' "$DIR/expected/ref-in-pack-template.json" \
  || die "ref-in-pack-template golden lost its point"
probe_golden inner-close-crosswire \
  "fixed: close(tmpl) + second pack: each child keeps its own key()"
grep -q '"name": "auth"' "$DIR/expected/inner-close-crosswire.json" \
  || die "inner-close-crosswire golden lost its point"
probe_golden pref-key-crosswire \
  "fixed: **key(n) default in an each-under-pack answers per child"
grep -q '"value": "auth"' "$DIR/expected/pref-key-crosswire.json" \
  || die "pref-key-crosswire golden lost its point"
probe_golden hide-pack-loss \
  "fixed: hide(pack(...)) hides the field; children keep their values"
grep -q '"a": 1' "$DIR/expected/hide-pack-loss.json" \
  || die "hide-pack-loss golden lost its point"
probe_golden quantity-concat \
  "quantity strings concatenate: '256Mi'+'256Mi' is '256Mi256Mi', exit 0"
grep -q '256Mi256Mi' "$DIR/expected/quantity-concat.json" \
  || die "quantity-concat golden lost its point"

echo "all $PASS checks passed"
