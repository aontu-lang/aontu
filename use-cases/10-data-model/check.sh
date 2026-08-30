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
# 12a. FIXED (the review's finding I): aggregation, projection and
# arithmetic-as-functions. An invoice total is now DERIVED rather than
# self-declared and spot-checked.
run gsum 0 -- "$DIR/gaps/agg-sum.aon"
has gsum '"total": 4008'
has gsum '"largest": 3998'
ok "sum(pick(lines, amountCents)) derives the total; greatest picks the max"

run gmul 0 -- "$DIR/gaps/multiply.aon"
has gmul '"amount": 3998'
has gmul '"vatCents": 759'
ok "mul/div compute quantity and integer-cent VAT in-model"

# ... and the `*` TOKEN still refuses, by design: maths arrives as
# functions, and the operator characters stay reserved.
run gstar 1 -- "$DIR/gaps/star-token.aon"
has gstar '[aontu/unexpected]'
ok "by design: '*' is still not an operator (parse refuses)"

run gmix 1 -- "$DIR/gaps/float-mix.aon"
has gmix '[aontu/exact_float_mix]'
ok "float + exact refused in either order (exact_float_mix)"

run gspread 1 -- "$DIR/gaps/spread-cross-field.aon"
has gspread '[aontu/no_path]'
ok "gap: cross-field must() in a spread template does not re-anchor (no_path)"

run glen 1 -- "$DIR/gaps/list-length-template.aon"
has glen '[aontu/constraint]'
ok "gap: length() on a list template folds against the template itself"

run guniq 1 -- "$DIR/gaps/unique-by-field.aon"
has guniq '[aontu/constraint]'
has guniq '$.customers'
ok "unique(ledgerId) catches the duplicate ledgerId across customers"

# 2026-08-26: gap 6 fixed by the template-clone isolation change
# (ADR-005). This had TWO halves until ADR-014 removed the identity
# mark and the `id(key(0))` half stopped being a spelling; the shared
# suite dropped its pin (load-alias-idspread) with it. What remains is
# the half that was never about identity: an include whose record type
# references a named alias used to SILENTLY DROP the record -- exit 0,
# `customers {}` -- which is the failure mode worth a fixture, because
# a silent drop looks like success. Shared-spec pin: test/spec/file.tsv
# load-alias-spread.
run gid 0 -- "$DIR/gaps/include-alias-spread/main.aon"
has gid '"ledgerId": 5'
has gid '"id": "cust-1001"'
ok "fixed: include + nested alias emits the record, not an empty bag"

# 13. THE MONEY WIRE CONVENTION (the review's finding I). Gap 1 said
# exact money was unreachable from plain JSON. It is reachable -- as a
# decimal STRING with the conversion declared in the schema -- and this
# section asserts every half of that claim.

# The wire record is strictly JSON, and vets.
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' \
  "$DIR/data/quote-wire.json" \
  || fail "quote-wire.json is not strict JSON"
run mwire 0 -- vet "$DIR/money-wire.aon" "$DIR/data/quote-wire.json"
has mwire 'verdict: valid'
ok "money as a decimal string vets from a strictly-JSON record"

# The mark is OPTIONAL for a producer and CONSTANT when supplied: a
# record may echo it (and a negative amount is ordinary), a record may
# not contradict it. A preference could not make that second check.
run mmark 0 -- vet "$DIR/money-wire.aon" "$DIR/data/quote-wire-marked.json"
has mmark 'verdict: valid'
run mbadmark 1 -- vet "$DIR/money-wire.aon" "$DIR/bad/quote-wire-mark.json"
has mbadmark '$.quote.dec'
has mbadmark 'bigdecimal:2'
ok "the conversion mark is optional to send and impossible to contradict"

# The pattern is the guard: the wrong scale and a JSON NUMBER are both
# refused, at the field rather than at the record.
run mscale 1 -- vet "$DIR/money-wire.aon" "$DIR/bad/quote-wire-scale.json"
has mscale '$.quote.amount'
run mnum 1 -- vet "$DIR/money-wire.aon" "$DIR/bad/quote-wire-number.json"
has mnum '$.quote.amount'
ok "wrong scale and a bare JSON number are refused at \$.quote.amount"

# The convention SURVIVES EXPORT: a consumer holding only the JSON
# Schema gets the same pattern, and learns the leaf and scale from the
# mark's const. Asserted by running the exported pattern over the same
# records vet just judged -- the two must agree.
run mjs 0 -- jsonschema --at '$.Money' "$DIR/money-wire.aon"
has mjs '"pattern": "^-?(0|[1-9][0-9]*)[.][0-9]{2}$"'
has mjs '"const": "bigdecimal:2"'
node -e '
  const Fs = require("fs")
  const schema = JSON.parse(Fs.readFileSync(process.argv[1], "utf8"))
  const re = new RegExp(schema.properties.amount.pattern)
  if (schema.required.includes("dec")) {
    throw new Error("the mark must not be required of a producer")
  }
  const amount = (f) =>
    JSON.parse(Fs.readFileSync(f, "utf8")).quote.amount
  // The two keywords a stock validator applies, in the order it
  // applies them: `type` is what refuses a bare JSON number (whose
  // TEXT the pattern would happily accept), `pattern` is what refuses
  // the wrong scale. Both are needed, which is the point.
  const admits = (v) => "string" === typeof v && re.test(v)
  for (const f of process.argv.slice(2, 4)) {
    if (true !== admits(amount(f))) {
      throw new Error("exported schema rejects a record vet accepts: " + f)
    }
  }
  for (const f of process.argv.slice(4)) {
    if (false !== admits(amount(f))) {
      throw new Error("exported schema accepts a record vet refuses: " + f)
    }
  }
' "$WORK/mjs.out" \
  "$DIR/data/quote-wire.json" "$DIR/data/quote-wire-marked.json" \
  "$DIR/bad/quote-wire-scale.json" "$DIR/bad/quote-wire-number.json" \
  || fail "the exported JSON Schema does not agree with vet"
ok "the exported JSON Schema carries the pattern and the mark, and agrees"

# The crossing point itself: every conversion claim in
# money-convert.aon is a theorem, so evaluating the file IS the test.
run mconv 0 -- --canon "$DIR/money-convert.aon"
has mconv '"amount":0d3998.19'
has mconv '"refund":-0d12.05'
has mconv '"sameNumber":0d10.5'
has mconv '"scaleZeroRight":0d10.0'
has mconv '"vatExact":0d759.6561'
ok "the wire<->exact conversion, its sign, its scale and its VAT all pin"

echo
echo "all $pass checks passed"
