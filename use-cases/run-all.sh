#!/usr/bin/env bash
# Run every use case's check.sh and report a one-line verdict per case.
# Each check drives the real TypeScript CLI (ts/bin/aontu.js) end to end;
# a case passes only when all of its assertions hold. See README.md.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
fail=0
for case in "$DIR"/[0-9][0-9]-*/; do
  name="$(basename "$case")"
  if [ ! -x "$case/check.sh" ]; then
    printf '%-22s SKIP (no check.sh)\n' "$name"
    continue
  fi
  if out="$("$case/check.sh" 2>&1)"; then
    printf '%-22s ok   (%s)\n' "$name" "$(printf '%s' "$out" | tail -1)"
  else
    printf '%-22s FAIL\n%s\n' "$name" "$out"
    fail=1
  fi
done
exit "$fail"
