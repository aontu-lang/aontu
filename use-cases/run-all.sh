#!/usr/bin/env bash
# Run every use case's check.sh, and every system's, reporting a
# one-line verdict per item.
# Each check drives the real TypeScript CLI (ts/bin/aontu.js) end to end;
# a case passes only when all of its assertions hold. See README.md.
#
# The case inventory is an explicit manifest, not directory discovery: a
# case that goes missing must fail the aggregate run, not silently
# narrow it.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CASES="
01-service-catalog
02-deploy-config
03-api-contract
04-schema-evolution
05-rbac-policy
06-k8s-golden-path
07-event-contracts
08-feature-flags
09-agent-tools
10-data-model
11-shared-modules
12-relations
13-recursive-schema
14-jsonschema-export
15-code-generation
16-module-deps
17-lambda-handlers
18-role-permissions
"

fail=0
for name in $CASES; do
  case="$DIR/$name"
  if [ ! -x "$case/check.sh" ]; then
    printf '%-22s FAIL (missing case or check.sh)\n' "$name"
    fail=1
    continue
  fi
  if out="$("$case/check.sh" 2>&1)"; then
    printf '%-22s ok   (%s)\n' "$name" "$(printf '%s' "$out" | tail -1)"
  else
    printf '%-22s FAIL\n%s\n' "$name" "$out"
    fail=1
  fi
done

# --- the systems -----------------------------------------------------
#
# `test/system/` holds complete applications generated from one model,
# and each has a `check.sh` of the same shape. They
# run here because this is the job that drives the real CLI end to end,
# and because until they did NOTHING IN CI REACHED THEM: a system can
# only catch a regression it is asked about.
#
# A system's own toolchain (Ruby and a bundle, for `rb-solar`) is not
# installed by this job, and its `check.sh` skips those legs with a note
# rather than failing — so what runs here is the generation half: the
# generators, the committed tree they must reproduce byte for byte, and
# the pinned diagrams. The legs that boot the application need the job
# in that system's own directory.
#
# The BYTE GATE is not among those skips in CI. The workflow installs a
# pinned generator runtime and fails when it cannot be resolved, because
# a seam that exits 3 turns every byte check into a silent pass.

SYSTEMS_DIR="$(cd "$DIR/../test/system" && pwd)"
SYSTEMS="
rb-solar
"

for name in $SYSTEMS; do
  system="$SYSTEMS_DIR/$name"
  if [ ! -x "$system/check.sh" ]; then
    printf '%-22s FAIL (missing system or check.sh)\n' "$name"
    fail=1
    continue
  fi
  if out="$("$system/check.sh" 2>&1)"; then
    printf '%-22s ok   (%s)\n' "$name" "$(printf '%s' "$out" | tail -1)"
  else
    printf '%-22s FAIL\n%s\n' "$name" "$out"
    fail=1
  fi
done

# A system directory not in the manifest is one nothing runs.
for system in "$SYSTEMS_DIR"/*/; do
  name="$(basename "$system")"
  if ! printf '%s' "$SYSTEMS" | grep -qx "$name"; then
    printf '%-22s FAIL (a system present but not in the manifest above)\n' "$name"
    fail=1
  fi
done

# A numbered directory not in the manifest is a case nothing runs —
# refuse it rather than let it look covered.
for case in "$DIR"/[0-9][0-9]-*/; do
  name="$(basename "$case")"
  if ! printf '%s' "$CASES" | grep -qx "$name"; then
    printf '%-22s FAIL (present but not in the manifest above)\n' "$name"
    fail=1
  fi
done

exit "$fail"
