#!/usr/bin/env bash
# check.sh --- drive the aontu CLI end to end over the API-contract
# model: the emit -> validate -> repair loop, report formats, fragment
# anchors, evolution gating. Asserts every outcome. Runnable from any
# cwd.
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
    || { cat "$WORK/$name.out" "$WORK/$name.err" >&2
         fail "$name: exit $got, wanted $want"; }
}

# has <name> <stream> <fixed-string>
hasnt() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    && { cat "$WORK/$1.$2" >&2; fail "$1: $2 should not contain: $3"; }
  return 0
}

has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}

# lacks <name> <stream> <fixed-string>
lacks() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    && { cat "$WORK/$1.$2" >&2; fail "$1: $2 must NOT contain: $3"; } \
    || true
}

# --- 1. The contract as ground truth: canon, inventory, identity. ---

# Whole-file generation is BLOCKED by design (README gap 2 forces the
# vet anchors to stay unmarked, and unmarked abstract values cannot
# generate). Pin that price:
# 2026-08-27 (ADR-007): the refusal is now `disjunct_no_gen`, class
# incomplete -- "more than one alternative still admitted" -- rather
# than a scalar_value CONFLICT between an enum's own branches, which is
# what folding them together used to report.
run geneval 1 -- "$DIR/contract.aon"
has geneval err '[aontu/disjunct_no_gen]'
ok "contract.aon does not generate (the documented price of gap 2)"

# 2026-08-26: golden regenerated after the template-clone isolation
# change (ADR-005). Two spots inside the api spread TEMPLATE changed:
# the method disjunction canons as parsed (nested parens, no longer
# flattened by a destination's application leaking back), and summary's
# length() keeps its written argument (the `integer&` residue came from
# the same leak). Every applied endpoint is byte-identical.
run canon 0 -- --canon "$DIR/contract.aon"
diff -u "$DIR/expected/contract.canon" "$WORK/canon.out" \
  || fail "canonical form drifted from expected/contract.canon"
ok "--canon: the ground-truth serialization is stable (constraints kept)"

run inv 0 -- get '$.api' "$DIR/contract.aon"
diff -u "$DIR/expected/api-inventory.json" "$WORK/inv.out" \
  || fail "endpoint inventory drifted"
run ep 0 -- get '$.api.create_user' "$DIR/contract.aon"
diff -u "$DIR/expected/create-user-endpoint.json" "$WORK/ep.out" \
  || fail "create_user endpoint slice drifted"
ok "get: concrete endpoint inventory (type()-marked schemas omitted)"

# The inventory LOSES the response status codes (type()-marked values
# vanish wholesale: "responses": {}); get --keys recovers them.
has inv out '"responses": {}'
run rkeys 0 -- get '$.api.create_user.responses' --keys "$DIR/contract.aon"
diff -u "$DIR/expected/responses-keys.txt" "$WORK/rkeys.out" \
  || fail "response status codes drifted"
ok "get --keys: status codes 201/400/409 recovered (invisible in JSON view)"

run hash 0 -- hash "$DIR/contract.aon"
grep -q '^aon1-' "$WORK/hash.out" || fail "hash did not print an aon1- pin"
run agents 0 -- agentsmd "$DIR/contract.aon"
has agents out 'Ground truth: '
has agents out 'contract.aon'
has agents out 'aon1-'
ok "hash + agentsmd: identity pin and agent-onboarding stanza"

# Provenance for agent context: why traces a wire field to its source
# file (correct attribution -- contrast the vet schema sites below).
run why 0 -- why '$.msg.CreateUserRequest.email' "$DIR/contract.aon"
has why out 'messages.aon:'
ok "why: email requirement traced to its defining file"

# --- 2. The emit -> validate -> repair loop over agent candidates. ---

run vok 0 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-ok.json"
has vok out 'verdict: valid'
ok "vet: well-formed candidate accepted (exit 0)"

run vtypes 1 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-wrong-types.json"
has vtypes out '[aontu/constraint]'
has vtypes out '[aontu/no_scalar_unify]'
has vtypes out 'expected: string&length(integer&min(1)&max(80))'
ok "vet: wrong types refused; constraint finding carries expected residual"

run vsubtle 1 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-subtle.json"
has vsubtle out '[aontu/constraint]'
has vsubtle out 'expected: re("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")'
has vsubtle out '[aontu/empty]'
has vsubtle out '"admin"|"member"|"viewer"'
# ...and, since 2026-08-27 (ADR-007), the enum finding's schema site
# has a real source location. The meet mints a fresh disjunction, which
# used to arrive unsited, so this finding pointed at -1:-1 with nowhere
# for a repair loop to go; a narrowed disjunction now carries the site
# of the one it came from.
#
# THE FILE IS types.aon, and that is the second half of the same fix
# (finding F, BUGS.md §25). The enum is declared in types.aon at 34:9
# and reached through an include; the site used to carry the ENTRY
# file's name with the included file's coordinates -- and contract.aon
# is nineteen lines long, so `contract.aon:35:15` named a line that
# does not exist. Every site now names the file whose text it excerpts.
has vsubtle out 'types.aon:34:9'
ok "vet: bad email + bad enum refused; alternatives shown, enum site located"

# Missing required field, non-enum: verdict incomplete, exit 3 -- the
# loop's third answer ("add what is missing" vs "fix what is wrong").
run vmiss 3 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-missing-name.json"
has vmiss out 'verdict: incomplete'
has vmiss out '[aontu/mapval_required]'
# GAP 3 CLOSED 2026-08-27 (finding F, BUGS.md §25). The schema site
# used to name the ENTRY file while carrying row/col that belong to the
# included types.aon -- a real file name against a line it does not
# have, which is the worst of the three possible answers because it
# looks right. Pinned structurally, in both directions: the row the
# finding cites holds DisplayName in the file the finding NAMES, and
# the entry file's own line of that number does not.
row="$(grep -o 'types.aon:[0-9]*' "$WORK/vmiss.out" | head -1 | cut -d: -f2)"
[ -n "$row" ] || fail "vmiss: schema site does not name types.aon"
sed -n "${row}p" "$DIR/types.aon" | grep -q 'DisplayName' \
  || fail "vmiss: types.aon:$row is not DisplayName; site pin stale"
sed -n "${row}p" "$DIR/contract.aon" | grep -q 'DisplayName' \
  && fail "vmiss: contract.aon:$row is DisplayName too; the pin proves nothing" \
  || true
ok "vet: missing name -> exit 3; schema site names the file it excerpts"

# GAP 1 CLOSED 2026-08-27 (ADR-007). A required ENUM field could be
# omitted entirely: the unresolved disjunction counted as concrete
# because generation FOLDED its members together, and the resulting
# scalar CONFLICT was filtered out by vet's incomplete-class pass. It
# is now `disjunct_no_gen`, class incomplete -- the same answer the
# missing non-enum field above gets, and the same exit code, so the
# repair loop's "add what is missing" branch covers both.
run vhole 3 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-missing-role.json"
has vhole out 'verdict: incomplete'
has vhole out '$.msg.CreateUserRequest.role: disjunct_no_gen [incomplete]'
ok "vet: missing required enum field is incomplete (exit 3)"

# Surplus keys against close(): refused, but with NO nearest-key help.
run vsurp 1 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-surplus.json"
has vsurp out '[aontu/closed]'
has vsurp out '$.emial'
has vsurp out '$.favourite_colour'
lacks vsurp out 'did you mean'
# GAP 4 (path inconsistency): closed findings drop the --at anchor
# prefix that constraint findings keep.
lacks vsurp out '$.msg.CreateUserRequest.emial'
ok "vet --closed-by-schema: typo'd + surplus keys refused, no suggestions"

# Contrast: a typo in --at itself DOES get a did-you-mean note.
run vat 4 -- vet --at '$.msg.CreateUserRequst' "$DIR/contract.aon" \
  "$DIR/data/create-user-ok.json"
has vat out 'did you mean CreateUserRequest?'
ok "vet --at typo: no_path with did-you-mean (the help closed lacks)"

# Repair round A: bounded constraint + enum, from --format json alone.
run vjson 1 -- vet --at '$.msg.ListUsersQuery' --format json \
  "$DIR/contract.aon" "$DIR/data/list-users-query-bad.json"
python3 - "$WORK/vjson.out" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
codes = {f["code"] for f in r["findings"]}
assert r["verdict"] == "invalid", r["verdict"]
assert "constraint" in codes and "empty" in codes, codes
c = next(f for f in r["findings"] if f["code"] == "constraint")
assert c["expected"] == "integer&min(1)&max(100)", c["expected"]
assert c["actual"] == "500", c["actual"]
e = next(f for f in r["findings"] if f["code"] == "empty")
assert "expected" not in e, "enum finding grew an expected field: update README gap 6"
sv = [s["value"] for s in e["sites"] if s["role"] == "schema"]
assert sv == ['"name"|"-name"|"created_at"|"-created_at"'], sv
EOF
python3 "$DIR/repair.py" \
  --candidate "$DIR/data/list-users-query-bad.json" \
  --findings "$WORK/vjson.out" --out "$WORK/query-repaired.json" \
  --anchor '$.msg.ListUsersQuery' >"$WORK/repairA.log"
diff -u "$DIR/expected/query-repaired.json" "$WORK/query-repaired.json" \
  || fail "repaired query drifted"
run vrevA 0 -- vet --at '$.msg.ListUsersQuery' "$DIR/contract.aon" \
  "$WORK/query-repaired.json"
ok "repair loop A: clamp from expected + enum from schema site -> valid"

# Repair round B: closed-key typo. The report gives no candidates, so
# the agent must fetch the declared keys itself and nearest-match.
run vsjson 1 -- vet --at '$.msg.CreateUserRequest' --format json \
  "$DIR/contract.aon" "$DIR/data/create-user-surplus.json"
run keys 0 -- get '$.msg.CreateUserRequest' --keys "$DIR/contract.aon"
python3 "$DIR/repair.py" \
  --candidate "$DIR/data/create-user-surplus.json" \
  --findings "$WORK/vsjson.out" --out "$WORK/surplus-repaired.json" \
  --anchor '$.msg.CreateUserRequest' --keys "$WORK/keys.out" \
  >"$WORK/repairB.log"
grep -q "key renamed to 'email'" "$WORK/repairB.log" \
  || fail "nearest-key rename did not happen"
diff -u "$DIR/expected/surplus-repaired.json" "$WORK/surplus-repaired.json" \
  || fail "repaired surplus candidate drifted"
run vrevB 0 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$WORK/surplus-repaired.json"
ok "repair loop B: emial->email via client-side key fetch -> valid"

# Two candidates in one run: worst verdict wins.
run vmulti 1 -- vet --at '$.msg.CreateUserRequest' "$DIR/contract.aon" \
  "$DIR/data/create-user-ok.json" "$DIR/data/create-user-subtle.json"
has vmulti out 'verdict: invalid'
ok "vet: multiple candidates, worst verdict wins"

# --- 3. SARIF for CI ingestion. ---

run sarif 1 -- vet --at '$.msg.CreateUserRequest' --format sarif \
  "$DIR/contract.aon" "$DIR/data/create-user-subtle.json"
python3 - "$WORK/sarif.out" <<'EOF'
import json, sys
s = json.load(open(sys.argv[1]))
assert "sarif-2.1.0" in s["$schema"], s["$schema"]
results = s["runs"][0]["results"]
assert len(results) == 2, len(results)
props = [r["properties"] for r in results]
assert any(p.get("code") == "constraint" and "expected" in p for p in props)
assert all(r["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
           .endswith("create-user-subtle.json") for r in results)
EOF
ok "vet --format sarif: 2.1.0 report, native finding embedded, exit still 1"

# --- 4. Response bodies: entity and list-page candidates. ---

run v201 0 -- vet --at '$.api.create_user.responses.201' \
  "$DIR/contract.aon" "$DIR/data/user-201-ok.json"
has v201 out 'verdict: valid'
ok "vet --at through the registry (numeric status-code key) works"

run venv 0 -- vet --at '$.errors.Envelope' "$DIR/contract.aon" \
  "$DIR/data/error-envelope-ok.json"
ok "vet: error envelope with inline-template details list accepted"

# GAP 7, FIXED 2026-08-29 by ADR-011: the DRY page schema
# (items: [&: $.entities.User]) vets under --at.  A lifted anchor's
# absolute ref used to die as [aontu/no_path] at $.entities.User.
run vpageat 0 -- vet --at '$.msg.UserPage' "$DIR/contract.aon" \
  "$DIR/data/user-page-ok.json"
has vpageat out 'verdict: valid'
ok "vet --at '\$.msg.UserPage': ref-in-list-spread now resolves (gap 7 fixed)"

# The workaround: a root-anchored duplicate schema, vetted without --at.
run vpage 0 -- vet "$DIR/user-page.aon" "$DIR/data/user-page-ok.json"
has vpage out 'verdict: valid'
run vpagebad 1 -- vet "$DIR/user-page.aon" "$DIR/data/user-page-bad.json"
has vpagebad out '[aontu/constraint]'
has vpagebad out '"grace.hopper@"'
# GAP 8: the finding's path says items.0 but the broken element is
# items[1] (the data site's row is correct; the path index is not).
# 2026-08-26: unchanged by the template-clone isolation change
# (ADR-005) — this is a TS-only attribution defect (the Go port
# answers items.1), site-attribution family, still open.
has vpagebad out '$.items.0.email'
run vpagemiss 3 -- vet "$DIR/user-page.aon" \
  "$DIR/data/user-page-missing-total.json"
has vpagemiss out 'verdict: incomplete'
ok "root-anchored page schema: valid/invalid/incomplete all work (gap 8 pinned)"

# --- 5. The contract polices itself and its own evolution. ---

run badm 1 -- --canon --include-root "$DIR" "$DIR/bad/new-endpoint-method.aon"
has badm err '[aontu/empty]'
has badm err '"FETCH"'
has badm err '"GET"|"POST"|"PATCH"|"DELETE"'
ok "registry spread: endpoint with method FETCH refused by the contract"

# NOTE: breaking rejects the global --trust/--include-root options
# (gap 11), so the include-outside-entry-root warning on stderr cannot
# be addressed here the way it is for --canon above.
run brk 1 -- breaking --against "$DIR/contract.aon" \
  "$DIR/evolution/tighten-page-size.aon"
has brk out 'verdict: breaking'
has brk out 'compat_narrowed'
has brk out 'PageSize'
# REFLEXIVITY: the contract is compatible with ITSELF. It was not
# until 2026-09-02 -- every `&:` spread template read as
# sub_path_dependent_spread, so a byte-identical document came back
# undecided (exit 3) and `breaking` on this idiom had to run
# --allow-undecided, which masks the genuine undecideds it exists to
# surface (use-cases/BUGS.md 64). Identical templates are now the same
# template, and the escape hatch is no longer needed here.
run brksame 0 -- breaking --against "$DIR/contract.aon" "$DIR/contract.aon"
has brksame out 'verdict: compatible'
hasnt brksame out 'sub_path_dependent_spread'
ok "breaking: 100->50 refused; the contract is compatible with itself"


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 2 "$DIR/contract.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 2 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/contract.aon"
run docsvg 0 -- view doc --depth 2 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/contract.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
