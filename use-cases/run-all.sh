#!/usr/bin/env bash
# Run every use case's check.sh and report a one-line verdict per case.
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
