#!/usr/bin/env bash
# End-to-end validation of the feature-flag / runtime-config use case.
#
# Drives the real aontu CLI: build + goldens, layered-default
# resolution, candidate vetting, the OPERATIONAL WRITE LOOP (aontu
# set: append, idempotency, contradiction refusal, --in-place, a
# 10-set sweep, narrowing, the open-map typo hazard, and the
# deferred must() policy traps), why provenance, and the trust
# profile with a filesystem escape denied.
#
# Expected FAILURES are asserted by exit code and by the error code in
# the output ([aontu/...]), never by byte-comparing error prose.
# Expected JSON is diffed against expected/*.json goldens.
#
# All mutation happens in a temp copy of the model, so the committed
# files (overlay.aon in particular) are never touched.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Work on a copy so `aontu set` never dirties the committed overlay.
WORK="$TMP/model"
cp -r "$DIR" "$WORK"
: > "$WORK/overlay.aon"
printf '# Ops overlay: written by `aontu set`, never by hand.\n' > "$WORK/overlay.aon"

strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }

PASS=0
ok()  { PASS=$((PASS + 1)); echo "ok $PASS - $1"; }
die() { echo "FAIL - $1" >&2; exit 1; }

# run NAME EXPECTED_EXIT ARGS... : capture ANSI-stripped combined
# output in $TMP/NAME.out and assert the exit code.
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

has() { # has NAME PATTERN LABEL : assert PATTERN appears in NAME.out
  grep -qF -- "$2" "$TMP/$1.out" || {
    sed 's/^/    /' "$TMP/$1.out" >&2
    die "$1: missing '$2' ($3)"
  }
}

getval() { # getval PATH FILE : echo the value, no assertion
  $AONTU get "$1" "$2" 2>/dev/null
}

get_is() { # get_is PATH FILE EXPECTED LABEL
  local got; got="$(getval "$1" "$2")"
  [ "$got" = "$3" ] || die "get $1: expected $3, got $got"
  ok "$4"
}

echo "# ---------------------------------------------------------- build"

run build 0 "$WORK/base.aon"
diff -u "$DIR/expected/base.json" "$TMP/build.out" \
  || die "built model differs from expected/base.json"
ok "base model builds and matches golden (6 flags, 3 envs, 2 tenants)"

run canon 0 --canon "$WORK/flags.aon"
diff -u "$DIR/expected/flags.canon.txt" "$TMP/canon.out" \
  || die "canon differs from expected/flags.canon.txt"
ok "flags canon matches golden (defaults keep rank; kill-switch is a pin)"

echo "# --------------------------------------- layered default resolution"

# Rank ladder: ***org  <  **env  <  *tenant  <  concrete pin.
get_is '$.flags.checkout_v2.rollout' "$WORK/base.aon" '0' \
  "catalog: org *** default = 0 (flag born dark)"
get_is '$.effective.staging.base.checkout_v2.rollout' "$WORK/base.aon" '100' \
  "staging: env ** default (100) beats org ***"
get_is '$.effective.prod.base.checkout_v2.rollout' "$WORK/base.aon" '5' \
  "prod: env ** default (5) beats org ***"
get_is '$.effective.prod.megacorp.checkout_v2.rollout' "$WORK/base.aon" '25' \
  "prod+megacorp: tenant * (25) beats env **"
get_is '$.effective.prod.starterco.checkout_v2.rollout' "$WORK/base.aon" '0' \
  "prod+starterco: tenant * pins 0 over env ** (opt-out)"
get_is '$.effective.prod.base.checkout_v2.enabled' "$WORK/base.aon" 'true' \
  "prod: env ** enables a flag the org defaults dark"
get_is '$.effective.prod.megacorp.ui_dark_mode.variant' "$WORK/base.aon" '"midnight"' \
  "variant flag: tenant * variant beats env ** beats org ***"
get_is '$.effective.staging.base.ui_dark_mode.variant' "$WORK/base.aon" '"dusk"' \
  "variant flag: env ** variant where no tenant override"
get_is '$.effective.prod.base.payments_legacy_gateway.enabled' "$WORK/base.aon" 'false' \
  "kill switch: concrete pin holds across every env view"

# Effective views (whole maps) match goldens.
run effmega 0 get '$.effective.prod.megacorp' "$WORK/base.aon"
diff -u "$DIR/expected/prod-megacorp.json" "$TMP/effmega.out" \
  || die "prod/megacorp view differs from golden"
ok "prod/megacorp effective view matches golden"

run effstag 0 get '$.effective.staging.base' "$WORK/base.aon"
diff -u "$DIR/expected/staging-base.json" "$TMP/effstag.out" \
  || die "staging view differs from golden"
ok "staging effective view matches golden"

run effprod 0 get '$.effective.prod.base' "$WORK/base.aon"
diff -u "$DIR/expected/prod-base.json" "$TMP/effprod.out" \
  || die "prod/base view differs from golden"
ok "prod/base effective view matches golden"

run effstarter 0 get '$.effective.prod.starterco' "$WORK/base.aon"
diff -u "$DIR/expected/prod-starterco.json" "$TMP/effstarter.out" \
  || die "prod/starterco view differs from golden"
ok "prod/starterco effective view matches golden"

echo "# ------------------------------------------- vet: agent candidates"

run vgood 0 vet --at '$.Flag' --closed "$WORK/flag-schema.aon" \
  "$WORK/data/candidate-reranker-v4.json"
has vgood "valid" "good candidate verdict"
ok "clean candidate passes the strict schema (closed)"

run vbad 1 vet --at '$.Flag' --closed "$WORK/flag-schema.aon" \
  "$WORK/data/candidate-bad.json"
has vbad "[aontu/constraint]" "bad candidate constraint code"
has vbad "[aontu/closed]"     "bad candidate closed code"
ok "bad candidate rejected: constraint (key/owner/desc/date/rollout) + closed (jira_ticket)"

# Incompleteness: a candidate missing required fields is 'incomplete'
# (exit 3), distinct from a constraint violation (exit 1).
run vinc 3 vet --at '$.Flag' --closed "$WORK/flag-schema.aon" \
  "$WORK/data/candidate-incomplete.json"
has vinc "[aontu/mapval_required]" "incomplete candidate code"
ok "incomplete candidate: missing enabled/rollout -> incomplete (exit 3)"

# sarif is machine-readable for CI ingestion.
run vsarif 1 vet --at '$.Flag' --closed --format sarif \
  "$WORK/flag-schema.aon" "$WORK/data/candidate-bad.json"
has vsarif "sarif-2.1.0" "sarif schema marker"
ok "vet emits SARIF for the bad candidate"

echo "# ---------------------------- vet: effective view read back out"

# The resolved org->env->tenant output is itself validated against the
# ground-truth schema, flag by flag (spread anchor limit; see README).
$AONTU get '$.effective.prod.megacorp.checkout_v2' "$WORK/base.aon" \
  > "$TMP/resolved-flag.json" 2>/dev/null
run vresolved 0 vet --at '$.Flag' --closed "$WORK/flag-schema.aon" \
  "$TMP/resolved-flag.json"
has vresolved "valid" "resolved flag verdict"
ok "fully-resolved flag (rollout 25) re-validates against the strict schema"

echo "# --------------------------------------- write loop: aontu set"

OV="$WORK/overlay.aon"

# 1. First set: appends one conjunct, verdict valid.
run set1 0 set '$.tenants.megacorp.flags.checkout_v2.rollout=50' \
  --entry "$WORK/base.aon" --overlay "$OV"
has set1 "verdict: valid" "set1 verdict"
get_is '$.effective.prod.megacorp.checkout_v2.rollout' "$WORK/system.aon" '50' \
  "overlay flows into the effective view (25 -> 50)"

# 2. Idempotency: setting the SAME value again is 'valid' but appends a
#    duplicate line -- garbage accumulates (documented in README).
run set2 0 set '$.tenants.megacorp.flags.checkout_v2.rollout=50' \
  --entry "$WORK/base.aon" --overlay "$OV"
lines_dup="$(grep -c 'checkout_v2.*rollout.*50' "$OV" || true)"
[ "$lines_dup" = "2" ] || die "expected 2 duplicate rollout lines, got $lines_dup"
ok "re-set to same value is 'valid' but appends a DUPLICATE (not idempotent)"

# 3. Append conflict: with two 50-lines present, a different value is
#    refused -- the overlay now self-conflicts.
run set3 1 set '$.tenants.megacorp.flags.checkout_v2.rollout=60' \
  --entry "$WORK/base.aon" --overlay "$OV"
has set3 "[aontu/scalar_value]" "append-mode conflict code"
ok "plain append of a differing value conflicts against the prior line"

# Repair: collapse the overlay to unique lines (fleet automation would
# do this, or use --in-place from the start).
awk '!seen[$0]++' "$OV" > "$OV.tmp" && mv "$OV.tmp" "$OV"

echo "# ------------------------------- write loop: --in-place idempotency"

# --in-place rewrites the literal instead of appending: 10 sets, still
# ONE line.  This is the fleet-safe write path.
for pct in 10 20 30 40 50 60 70 80 90 55; do
  $AONTU set "\$.tenants.megacorp.flags.checkout_v2.rollout=$pct" \
    --entry "$WORK/base.aon" --overlay "$OV" --in-place \
    > "$TMP/sweep.out" 2>&1 \
    || { sed 's/^/    /' "$TMP/sweep.out" >&2; die "in-place sweep failed at $pct"; }
done
rollout_lines="$(grep -c 'checkout_v2.*rollout' "$OV" || true)"
[ "$rollout_lines" = "1" ] || die "expected 1 rollout line after in-place sweep, got $rollout_lines"
get_is '$.tenants.megacorp.flags.checkout_v2.rollout' "$WORK/system.aon" '55' \
  "after 10 in-place sets, one line, last value wins (55)"
ok "--in-place: 10 sets collapse to a SINGLE overlay line (idempotent write path)"

echo "# ------------------------------ write loop: refusals (safety rails)"

# Kill switch: the flag is a concrete pin in flags.aon; no overlay can
# flip it.  set refuses and names the pinning site.
run setkill 1 set '$.flags.payments_legacy_gateway.enabled=true' \
  --entry "$WORK/base.aon" --overlay "$OV"
has setkill "[aontu/empty]" "kill-switch conflict code"
has setkill "verdict: invalid"     "kill-switch verdict"
ok "kill switch: set to true refused; the pin in flags.aon wins"

# The refusal wrote nothing: the overlay still has no payments line.
grep -q "payments_legacy_gateway" "$OV" \
  && die "refused set leaked a line into the overlay" || true
ok "a refused set leaves the overlay untouched"

# Over-length message on the CONSTRAINED field: ops_incident_banner
# declares message?: string & length(max(80)), so the length
# constraint refuses the write and nothing lands in the overlay.
run setmsglong 1 set \
  '$.flags.ops_incident_banner.message="this incident message is deliberately way over the eighty character maximum length"' \
  --entry "$WORK/base.aon" --overlay "$OV"
has setmsglong "[aontu/constraint]" "over-length message code"
has setmsglong "verdict: invalid"   "over-length verdict"
grep -q "ops_incident_banner" "$OV" \
  && die "refused over-length set leaked a line into the overlay" || true
ok "over-length message refused by length(max(80)); overlay untouched"

# Narrowing set: the same constraint-only optional key accepts its
# first concrete IN-RANGE value (this NARROWS, it does not contradict).
run setmsg 0 set \
  '$.flags.ops_incident_banner.message="Elevated 5xx on EU checkout; incident IN-2214"' \
  --entry "$WORK/base.aon" --overlay "$OV"
has setmsg "verdict: valid" "narrowing set verdict"
ok "narrowing set: optional message accepts its first concrete value"

# FINDING (the step a previous run tripped on): the SAME over-length
# string aimed at a flag that declares NO message field is ACCEPTED.
# The catalog maps are open and `set` enforces no closed world, so a
# typo'd or undeclared path writes straight through -- and the rogue
# field flows into the served effective view.
run settypo 0 set \
  '$.flags.search_reranker_v3.message="this incident message is deliberately way over the eighty character maximum length"' \
  --entry "$WORK/base.aon" --overlay "$OV"
has settypo "verdict: valid" "undeclared-field set verdict"
ok "set ACCEPTS an undeclared field on an open map (typo hazard, README)"

get_is '$.effective.prod.base.search_reranker_v3.message' "$WORK/system.aon" \
  '"this incident message is deliberately way over the eighty character maximum length"' \
  "the rogue undeclared field is served in the effective view"

# The read-side contract catches what the write path missed: vet the
# resolved flag against the strict closed Flag def.
$AONTU get '$.effective.prod.base.search_reranker_v3' "$WORK/system.aon" \
  > "$TMP/rogue-flag.json" 2>/dev/null
run vetrogue 1 vet --at '$.Flag' --closed "$WORK/flag-schema.aon" \
  "$TMP/rogue-flag.json"
has vetrogue "[aontu/constraint]" "rogue flag constraint code"
ok "read-side vet DOES refuse the rogue message (write/read guard asymmetry)"

# Roll the rogue line back before the policy-trap section.
grep -v 'search_reranker_v3.*message' "$OV" > "$OV.tmp" && mv "$OV.tmp" "$OV"

echo "# -------------------------- write loop: the DEFERRED policy trap"

# CRITICAL FINDING, CLOSED 2026-08-27 (ADR-007). `set`'s verdict is
# vet's verdict of entry vs overlay, and vet used to meet the SETTLED
# entry -- a tree whose must() audits had already been discharged
# against the entry's own values, before the overlay existed. So
# enabling an EXPIRED flag through the overlay was accepted (verdict
# valid) and only the full runtime view caught it, post-hoc. The meet
# is now built from a fresh parse, so the audit meets the overlay's
# value and `set` refuses the write at the point of writing.
run setzombie 1 set '$.flags.search_reranker_v3.enabled=true' \
  --entry "$WORK/base.aon" --overlay "$OV"
has setzombie "[aontu/must]" "zombie set refused by the lifecycle audit"
has setzombie "expired flags must be disabled" "the author's message"
ok "set REFUSES enabling an expired flag (must() audits fire on the write path)"

# The refusal means nothing was written: the runtime view is still
# green, and there is no post-hoc failure to clean up. `set` does not
# write an overlay whose change does not hold, so the write path and
# the read path now agree.
grep -q 'search_reranker_v3.*enabled.*true' "$OV" \
  && die "set wrote the refused zombie line into the overlay"
run zombieval 0 "$WORK/system.aon"
ok "the refused write never reached the overlay; runtime view stays valid"

# The range audit is the same story, and closed the same way
# (2026-08-27, ADR-007): an out-of-range rollout on the megacorp tenant
# used to be accepted even by the fleet-safe write path -- the catalog
# field carries no inline range (phase-1 limit, README), and the
# rollout_range must() audit had already been discharged against the
# entry's own values before the overlay existed. vet now meets a
# freshly parsed entry, so the audit meets the value being written and
# `set` refuses it.
run setbigroll 1 set '$.tenants.megacorp.flags.checkout_v2.rollout=200' \
  --entry "$WORK/base.aon" --overlay "$OV" --in-place
has setbigroll "[aontu/must]" "range audit code"
has setbigroll "rollout must be an integer in 0..100" "range audit message"
ok "set --in-place REFUSES rollout=200 (the rollout_range audit fires)"

# Nothing was written, so the runtime view never went red.
run rangeval 0 "$WORK/system.aon"
ok "the refused range write never reached the overlay; runtime view stays valid"

# A rollout the audit admits IS written, in place.
run setrepair 0 set '$.tenants.megacorp.flags.checkout_v2.rollout=55' \
  --entry "$WORK/base.aon" --overlay "$OV" --in-place
run afterrange 0 "$WORK/system.aon"
ok "an in-range rollout is accepted and the runtime view stays valid"

echo "# -------------------------------------------- why: value provenance"

# why attributes overlay-contributed values to the OVERLAY FILE.
run whytenant 0 why '$.tenants.megacorp.flags.checkout_v2.rollout' "$WORK/system.aon"
has whytenant "overlay.aon" "why names the overlay file"
has whytenant "layers.aon"  "why names the base layer file"
ok "why attributes the tenant rollout to overlay.aon AND layers.aon (per-file provenance)"

# But why through a REFERENCE-composed effective view sees only the
# spread; the overlay contribution is invisible there (README gap).
run whyeff 0 why '$.effective.prod.megacorp.checkout_v2.rollout' "$WORK/system.aon"
has whyeff "flags.aon" "why effective names the spread source"
ok "why at an effective path reports only the spread (references hide overlay provenance)"

echo "# ----------------------------------------------- trust: escape denied"

# Legit model under root confinement: all includes stay in-tree.
run trustok 0 --trust "root:$WORK" "$WORK/system.aon"
ok "runtime view evaluates under --trust root:<model-dir>"

# Hostile overlay pulls @\"/etc/hostname\" into a flag value.  Under
# root confinement the include is DENIED at parse time.
run trustdeny 1 --trust "root:$WORK" "$WORK/attack/evil-system.aon"
has trustdeny "include denied" "denied include message"
has trustdeny "/etc/hostname"  "denied path named"
ok "trust root: the filesystem escape @\"/etc/hostname\" is denied"

# --trust none denies every include, including the in-tree ones.
run trustnone 1 --trust none "$WORK/system.aon"
has trustnone "include denied" "trust none denies includes"
ok "trust none: no includes at all (hermetic)"

echo
echo "All $PASS checks passed."
