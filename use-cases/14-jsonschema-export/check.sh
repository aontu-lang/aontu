#!/usr/bin/env bash
# check.sh --- drive `aontu jsonschema` as the interop bridge: per-tool
# MCP inputSchema exports from a registry, a wire message exported
# whole, the money wire convention crossing intact, and the loss
# report -- every non-crossing construct named on stderr, --strict
# flipping the exit, a non-standing document refused. Runnable from
# any cwd.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$DIR/../.."
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); echo "ok $pass - $1"; }

run() {
  local name="$1" want="$2"; shift 3
  local got=0
  $AONTU "$@" >"$WORK/$name.out" 2>"$WORK/$name.err" || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.out" "$WORK/$name.err" >&2; \
         fail "$name: exit $got, wanted $want"; }
}

has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}

# ----------------------------------------------------------------
# 1. The MCP bridge: each tool's argument schema exports at its own
# anchor as exactly the inputSchema shape the protocol requires, and
# stderr stays EMPTY -- the registry is written in the crossing subset,
# so nothing is lost, and the goldens are complete contracts.
for tool in search_docs read_file create_ticket; do
  run "t_$tool" 0 -- jsonschema --at "\$.argschemas.$tool" "$DIR/registry.aon"
  diff -u "$DIR/expected/tool-${tool//_/-}.json" "$WORK/t_$tool.out" \
    || fail "$tool export drifted from expected/tool-${tool//_/-}.json"
  [ -s "$WORK/t_$tool.err" ] \
    && { cat "$WORK/t_$tool.err" >&2; fail "$tool: expected a clean export"; }
done
ok "jsonschema --at: three inputSchema-shaped exports, zero losses"

# 2. The exports hold structurally under a stock JSON reader (python3;
# the jsonschema validator package is deliberately not required --
# nothing here may depend on pip). Closedness, requiredness and the
# allOf-of-patterns rendering of a doubly-constrained string are the
# properties an MCP client actually relies on.
python3 - "$WORK/t_search_docs.out" "$WORK/t_read_file.out" <<'EOF'
import json, sys
s = json.load(open(sys.argv[1]))
assert s["type"] == "object" and s["additionalProperties"] is False
assert s["required"] == ["query"], s["required"]
assert set(s["properties"]) == {"query", "limit", "scope"}
assert s["properties"]["scope"]["enum"] == ["workspace", "org", "web"]
r = json.load(open(sys.argv[2]))
pats = [a["pattern"] for a in r["properties"]["path"]["allOf"]]
assert pats == ["^[A-Za-z0-9._/\\-]+$", "^[a-z]"], pats
assert r["properties"]["path"]["maxLength"] == 512
EOF
ok "exports parse and hold: closed, required right, two re() as allOf"

# 3. The wire message, exported WHOLE: the document's root is one
# close() expression, so additionalProperties:false lands at the
# root, the disjunctions land as enum (preference as default), and
# the optional keys stay out of required.
run msg 0 -- jsonschema "$DIR/message.aon"
diff -u "$DIR/expected/message.json" "$WORK/msg.out" \
  || fail "message export drifted from expected/message.json"
python3 - "$WORK/msg.out" <<'EOF'
import json, sys
s = json.load(open(sys.argv[1]))
assert s["additionalProperties"] is False
assert s["properties"]["priority"] == {
    "default": "normal", "enum": ["normal", "low", "high"]}
assert "note" not in s["required"] and "retries" not in s["required"]
EOF
ok "message.aon whole-document export: root close(), enum+default"

# 4. The money wire convention (use-case 10, finding I) crosses
# intact: the fixed-scale decimal's re() as pattern, the conversion
# mark as a const outside required. A consumer reading only the JSON
# Schema still learns the leaf and the scale.
run money 0 -- jsonschema --at quote "$DIR/money.aon"
diff -u "$DIR/expected/money.json" "$WORK/money.out" \
  || fail "money export drifted from expected/money.json"
has money out '"pattern": "^-?(0|[1-9][0-9]*)[.][0-9]{2}$"'
has money out '"const": "bigdecimal:2"'
python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); \
  assert s["required"]==["amount","currency"], s["required"]' "$WORK/money.out"
ok "money: Dec2 pattern and the bigdecimal:2 const mark both cross"

# 5. The loss report: residue.aon collects one instance of each class
# that cannot cross, the schema still exports (exit 0), and EVERY loss
# is named on stderr with its path and construct. Note must() reports
# as `nil` -- the engine holds the whole value residual, so the number
# bound beside it is lost too (reference-api.md documents this loss
# under `must`; the README records the difference).
run res 0 -- jsonschema --at report "$DIR/residue.aon"
diff -u "$DIR/expected/residue.json" "$WORK/res.out" \
  || fail "residue export drifted from expected/residue.json"
has res err 'lossy: $.report.total nil:'
has res err 'lossy: $.report.amountEur bigdecimal:'
has res err 'lossy: $.report.audit hide:'
has res err 'lossy: $.report.annotations.& unresolved:'
has res err 'lossy: $.report.attempts length:'
ok "residue: lossy export still exports, five losses each named"

# 6. --strict makes lossiness an error: same document, same report,
# exit 1 -- the mode for a pipeline that must not ship a schema
# admitting more than the model does.
run strict 1 -- jsonschema --strict --at report "$DIR/residue.aon"
has strict err 'lossy: $.report.total nil:'
ok "--strict: a lossy export exits 1 instead of 0"

# 7. --format json is the machine face of the same report: verdict
# `lossy`, the schema embedded, and each loss as {path, construct,
# reason} under the usual aontu envelope.
run resj 0 -- jsonschema --format json --at report "$DIR/residue.aon"
python3 - "$WORK/resj.out" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
assert r["aontu"]["verb"] == "jsonschema"
assert r["verdict"] == "lossy", r["verdict"]
assert {l["construct"] for l in r["lossy"]} \
    == {"nil", "bigdecimal", "hide", "unresolved", "length"}
assert all({"path", "construct", "reason"} <= set(l) for l in r["lossy"])
assert r["schema"]["properties"]["total"] == {}
EOF
ok "--format json: verdict lossy, losses as {path, construct, reason}"

# 8. The refusal surface: a document that does not stand up on its own
# has no unified value to export, so the verb refuses with exit 4 and
# a located [aontu/no_path] -- and stdout stays empty, never a partial
# schema.
run dangle 4 -- jsonschema "$DIR/bad/dangling.aon"
has dangle err '[aontu/no_path]'
has dangle err '$.people.alice.email'
[ -s "$WORK/dangle.out" ] \
  && { cat "$WORK/dangle.out" >&2; fail "dangle: stdout should be empty"; }
ok "bad: a dangling reference refuses (exit 4), nothing exported"

echo "all $pass checks passed"
