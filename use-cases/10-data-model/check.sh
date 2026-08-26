#!/usr/bin/env bash
# check.sh --- drive the aontu CLI end to end over the order-to-cash
# data-domain model and assert every outcome. Runnable from any cwd.
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
# Captures stdout+stderr in $WORK/<name>.out, asserts the exit code.
run() {
  local name="$1" want="$2"; shift 3
  local got=0
  $AONTU "$@" >"$WORK/$name.out" 2>&1 || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.out" >&2; fail "$name: exit $got, wanted $want"; }
}

# has <name> <fixed-string> -- the captured output must contain it.
has() {
  grep -qF -- "$2" "$WORK/$1.out" \
    || { cat "$WORK/$1.out" >&2; fail "$1: output does not contain: $2"; }
}

# ---------------------------------------------------------------------
# 1. The seed generator: evaluating the model IS generating fixtures.
run seed 0 -- "$DIR/seed.aon"
diff -u "$DIR/expected/seed.json" "$WORK/seed.out" \
  || fail "seed.aon output drifted from expected/seed.json"
ok "seed.aon evaluates to the golden fixture set (defaults filled, ids checked)"

# 2. Exact money survives canon; generation renders plain digits.
run canon 0 -- get '$.pricing.bundles' --canon "$DIR/seed.aon"
diff -u "$DIR/expected/bundles-canon.txt" "$WORK/canon.out" \
  || fail "canonical bundle prices drifted"
ok "canon keeps 0d exact-decimal money (0d0.3, 0d69.89)"

run exact 0 -- get '$.reconcile.exactPath' --canon "$DIR/seed.aon"
has exact '0d0.3'
run exactgen 0 -- get '$.reconcile.exactPath' "$DIR/seed.aon"
has exactgen '0.3'
ok "0d0.1 + 0d0.2 is exactly 0d0.3 (the pin in seed.aon holds)"

# 3. A batch of agent-emitted records, one vet command, three files.
run batch 0 -- vet "$DIR/seed.aon" \
  "$DIR/data/order-batch-1.json" "$DIR/data/order-batch-2.json" \
  "$DIR/data/customer-bigid.aon"
has batch 'verdict: valid'
ok "batch vet: two JSON order files + one 0d ledger sync, all valid"

# ...though every seed-based vet also emits a FALSE compat warning on
# the defaulted status field (README, gap 9). Assert current behaviour
# so a fix shows up as a diff here.
has batch 'pref_not_instance'
ok "known diagnostics bug reproduced: spurious pref_not_instance on *\"open\" default"

# 4. Referential integrity: an order naming an undeclared customer.
run dangle 1 -- vet "$DIR/seed.aon" "$DIR/bad/order-dangling.json"
has dangle '[aontu/refer_unresolved]'
has dangle 'cust-9999'
ok "dangling customerId refused (refer_unresolved)"

# 5. close(): a key the Customer schema does not declare.
run extra 1 -- vet "$DIR/seed.aon" "$DIR/bad/customer-extra-key.json"
has extra '[aontu/closed]'
has extra 'segment'
ok "undeclared key refused by close() (closed)"

# 6. re(): a country that is not an ISO 3166-1 alpha-2 code.
run country 1 -- vet "$DIR/seed.aon" "$DIR/bad/customer-country.json"
has country '[aontu/constraint]'
has country 're("^[A-Z]{2}$")'
ok "non-ISO country code refused by re() (constraint)"

# 7. 64-bit ids, part 1: plain JSON carrying 2^53+1 is refused at
# parse -- vet never sees a silently rounded id.
run lossy 1 -- vet "$DIR/seed.aon" "$DIR/bad/customer-id-lossy.json"
has lossy '[aontu/lossy_integer_literal]'
ok "lossy 64-bit id in plain JSON refused (lossy_integer_literal)"

# 8. 64-bit ids, part 2: the schema author's trap. The 0d-rescued id
# has biginteger kind; a schema saying `integer` refuses it.
run trap 1 -- vet "$DIR/bad/id-trap-schema.aon" "$DIR/data/customer-bigid.aon"
has trap '[aontu/constraint]'
has trap 'integer&min(1)'
has trap '0d9007199254740993'
ok "ledgerId: integer refuses the 0d id -- the kind trap is real"

# ...and the domain's two-leaf disjunction admits it (part of the
# batch vet above), while canon keeps it exact:
run bigid 0 -- get '$.customers.cust-1003.ledgerId' --canon "$DIR/data/customer-bigid.aon"
has bigid '0d9007199254740993'
ok "integer|biginteger admits the id; canon keeps it exact"

# 9. Exact money vs the JSON wire. bigdecimal is unreachable from a
# strict-JSON number; an .aon record satisfies it.
run qexact 0 -- vet "$DIR/exact-money.aon" "$DIR/data/quote-exact.aon"
has qexact 'verdict: valid'
run qfloat 1 -- vet "$DIR/exact-money.aon" "$DIR/data/quote-float.json"
has qfloat '[aontu/constraint]'
has qfloat 'bigdecimal'
ok "bigdecimal schema refuses the float 10.5 a JSON quote must carry"

# ...vet parses .json data as Aontu, so 0d-annotated pseudo-JSON is
# accepted -- but it is no longer JSON (README, gap 1).
run q0d 0 -- vet "$DIR/exact-money.aon" "$DIR/data/quote-0d.json"
has q0d 'verdict: valid'
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' \
  "$DIR/data/quote-0d.json" 2>/dev/null \
  && fail "quote-0d.json unexpectedly parses as strict JSON" || true
ok "0d pseudo-JSON vets as valid yet is rejected by a strict JSON parser"

# 10. Anchored vet: one record against one named type.
run anchored 0 -- vet --at '$.schema.Customer' "$DIR/domain.aon" \
  "$DIR/data/customer-record.json"
has anchored 'verdict: valid'
ok "vet --at \$.schema.Customer validates a bare record"

# 11. The reporting view is a sound projection of the domain.
run view 0 -- subsume "$DIR/reporting.aon" "$DIR/domain.aon"
has view 'verdict: subsumes'
ok "reporting view subsumes the domain (projection is sound)"

# ...and a view that assumes int64 ledger ids is caught -- though as
# 'undecided' (exit 3), not 'does_not_subsume' (README, what worked).
run viewbad 3 -- subsume "$DIR/bad/reporting-int64.aon" "$DIR/domain.aon"
has viewbad 'sub_disjunct_distribution'
has viewbad 'biginteger'
ok "int64-assuming view fails subsumption (undecided, biginteger cited)"

# 12. The gap reproductions: every failed attempt in gaps/ still
# fails the way the README documents.
run gsum 1 -- "$DIR/gaps/agg-sum.aon"
has gsum '[aontu/unknown_function]'
ok "gap: no sum()/fold over a list (unknown_function)"

run gmul 1 -- "$DIR/gaps/multiply.aon"
has gmul '[aontu/unexpected]'
ok "gap: no '*' operator (parse refuses)"

run gmix 1 -- "$DIR/gaps/float-mix.aon"
has gmix '[aontu/exact_float_mix]'
ok "float + exact refused in either order (exact_float_mix)"

run gspread 1 -- "$DIR/gaps/spread-cross-field.aon"
has gspread '[aontu/no_path]'
ok "gap: cross-field must() in a spread template does not re-anchor (no_path)"

run glen 1 -- "$DIR/gaps/list-length-template.aon"
has glen '[aontu/constraint]'
ok "gap: length() on a list template folds against the template itself"

run guniq 0 -- "$DIR/gaps/unique-by-field.aon"
has guniq '"Acme"'
has guniq '"Globex"'
ok "gap: duplicate ledgerIds pass unique() silently (no projection)"

run gid 1 -- "$DIR/gaps/include-id-key/main.aon"
has gid '[aontu/id_name]'
ok "gap: id(key(0)) + include + nested alias dies with bogus id_name"

run gsilent 0 -- "$DIR/gaps/include-id-key/main-silent.aon"
has gsilent '"customers": {}'
ok "gap: same pattern without id(key(0)) SILENTLY drops the record"

echo
echo "all $pass checks passed"
