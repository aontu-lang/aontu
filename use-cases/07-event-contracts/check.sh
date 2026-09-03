#!/usr/bin/env bash
# check.sh --- drive the aontu CLI end to end over the event-contract
# model: stream vetting at the discriminated union, branch-anchored
# dispatch, timestamp/id formats, canon identity, and the versioned
# breaking gate. Asserts every outcome. Runnable from any cwd.
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

V1="$DIR/orders-v1.aon"

# --- 1. The contract as registry ground truth: canon, identity. ---

run canon 0 -- --canon "$V1"
diff -u "$DIR/expected/orders-v1.canon" "$WORK/canon.out" \
  || fail "canonical form drifted from expected/orders-v1.canon"
run opcanon 0 -- get '$.OrderPaid' --canon "$V1"
diff -u "$DIR/expected/order-paid.canon" "$WORK/opcanon.out" \
  || fail "OrderPaid canonical slice drifted"
run keys 0 -- get '$.registry' --keys "$V1"
diff -u "$DIR/expected/registry-keys.txt" "$WORK/keys.out" \
  || fail "registry key list drifted"
run hash 0 -- hash "$V1"
grep -q '^aon1-' "$WORK/hash.out" || fail "hash did not print an aon1- pin"
ok "canon + subtree canon + registry keys + aon1- identity pin"

# GAP (canon infidelity): the canonical TEXT drops close() and the
# conjunct *default. Re-parse the canon as a contract and the same
# surplus-key event that the real contract refuses now passes, and
# the hash changes. A registry must never serve canon text as the
# contract.
run vsurp 1 -- vet --at '$.registry.order_paid' "$V1" \
  "$DIR/data/bad/paid-surplus-topic.json"
has vsurp out '[aontu/closed]'
cp "$DIR/expected/orders-v1.canon" "$WORK/served.aon"
run vsurpcanon 0 -- vet --at '$.registry.order_paid' "$WORK/served.aon" \
  "$DIR/data/bad/paid-surplus-topic.json"
has vsurpcanon out 'verdict: valid'
# 2026-08-27: canon now KEEPS the conjunct default -- `("1.0"|"1.1") &
# *"1.0"` canons as `*"1.0"|"1.1"`, because a preference conjoined with
# a disjunction is now a preference on the alternative it names -- so
# the round-tripped text loses close() and nothing else.
run hashserved 0 -- hash "$WORK/served.aon"
diff -q "$WORK/hash.out" "$WORK/hashserved.out" >/dev/null \
  && fail "canon round-trip kept the hash; canon infidelity fixed? update README" \
  || true
ok "canon round-trip LOSES close(): surplus key passes (pinned gap)"

# GAP CLOSED 2026-08-27: two contracts differing only in the conjunct
# default used to canon -- and therefore hash -- identically, because
# the conjoined `*` vanished in the meet. A preference conjoined with a
# disjunction is now a preference on the alternative it names, so the
# default survives into canon and the two identities differ.
run hda 0 -- hash "$DIR/probes/default-a.aon"
run hdb 0 -- hash "$DIR/probes/default-b.aon"
diff -q "$WORK/hda.out" "$WORK/hdb.out" >/dev/null \
  && fail "default-a/default-b hash identically; the conjunct default is lost again"
ok "hash: different conjunct defaults give different aon1- identities"

# GAP CLOSED 2026-08-27 (the review's finding E): why traces the
# envelope conjunction. The field is supplied by a reference to
# envelope.aon and reached this path by being CLONED, which used to put
# it outside the recorder's parsed-tree id set -- "(no contributions:
# nothing met at this path)" over a value it had just printed. It now
# names the file and line the pattern was written on, which is the
# whole audit question for a shared envelope.
run why 0 -- why '$.OrderPaid.time' "$V1"
has why out 'envelope.aon:'
grep -q 'no contributions' "$WORK/why.out" \
  && fail 'why: envelope-supplied field is silent again' || true
ok "why: envelope-supplied field names the file that wrote it"

# The price of the schema style: the contract never evaluates (and
# the error snippet quotes the WRONG FILE: header envelope.aon:13,
# body lines from orders-v1.aon).
# 2026-08-27 (ADR-007): the refusal is now `disjunct_no_gen` on the
# envelope's `id: (integer | biginteger) & min(1)` -- an unresolved
# disjunction is incomplete residue rather than a folded conflict -- so
# evaluation stops at that field instead of a later constraint. The
# misattribution pin is unchanged and still the point: the frame header
# names envelope.aon:13 (which IS where `id` is written) while the
# quoted source lines come from orders-v1.aon.
run geneval 1 -- "$V1"
has geneval err '[aontu/disjunct_no_gen]'
has geneval err 'envelope.aon:13:7'
has geneval err 'customer_id'
grep -q 'customer_id' "$DIR/envelope.aon" \
  && fail "envelope.aon now holds customer_id; misattribution pin stale" \
  || true
ok "eval: contract abstract (exit 1); snippet misattributed (pinned gap)"

# --- 2. Vetting the stream at the union anchor. ---

run stream 0 -- vet --at '$.Event' "$V1" \
  "$DIR/data/stream/placed-1001.json" \
  "$DIR/data/stream/paid-1002.json" \
  "$DIR/data/stream/cancelled-1003.json"
has stream out 'verdict: valid'
ok "vet: three-event stream sample in one command, one verdict"

# cancelled-1003 omits specversion; the conjunct default fills it.
# 2026-08-27: it genuinely does now. This used to pass for the wrong
# reason -- the conjoined `*` was lost in the meet, so specversion was
# an UNRESOLVED enum, and the fold's scalar conflict was filtered out
# of the report by vet's incomplete-class pass. `get` reads the filled
# value back, which is the assertion the verdict alone never made.
run dfill 0 -- vet --at '$.Event' "$V1" "$DIR/data/stream/cancelled-1003.json"
has dfill out 'verdict: valid'
run dfillget 0 -- get '$.Envelope.specversion' "$DIR/envelope.aon"
has dfillget out '"1.0"'
ok "vet: omitted specversion filled by the enum-guarded default"

run streambad 1 -- vet --at '$.Event' "$V1" \
  "$DIR/data/stream/placed-1001.json" \
  "$DIR/data/bad/paid-zero-amount.json"
has streambad out 'verdict: invalid'
ok "vet: stream with one bad event, worst verdict wins"

# --- 3. KEY FINDING: error localisation inside the union. ---

# Valid discriminator (order.paid), invalid payload (amount_cents 0).
# The union reports ONE empty at $.Event: no field path, no branch
# selection, all three alternatives dumped into a single schema site.
run ubad 1 -- vet --at '$.Event' "$V1" "$DIR/data/bad/paid-zero-amount.json"
has ubad out '$.Event: empty [conflict]'
lacks ubad out '$.Event.payload.amount_cents'
lacks ubad out 'expected: integer&min(1)'
has ubad out '"type":"order.placed"'
has ubad out '"type":"order.paid"'
has ubad out '"type":"order.cancelled"'
run ubadj 1 -- vet --at '$.Event' --format json "$V1" \
  "$DIR/data/bad/paid-zero-amount.json"
python3 - "$WORK/ubadj.out" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
assert r["verdict"] == "invalid", r["verdict"]
assert len(r["findings"]) == 1, len(r["findings"])
f = r["findings"][0]
assert f["code"] == "empty" and f["path"] == "$.Event", (f["code"], f["path"])
schema = next(s for s in f["sites"] if s["role"] == "schema")
# 2026-08-27: the union's schema site now HAS a location (a narrowed
# disjunction carries the site of the one it came from). What is still
# missing is localisation INSIDE the union: one finding at $.Event
# carrying every alternative as one blob, with no field path and no
# branch selection. That is the gap this row pins.
assert schema["row"] > 0 and schema["col"] > 0, (schema["row"], schema["col"])
assert len(schema["value"]) > 1500, len(schema["value"])  # the blob
EOF
ok "union anchor: wrong payload -> one empty blob, zero localisation (KEY gap)"

# Same event at the dispatched branch: exact field, expected residual,
# row/col in both files.
run branch 1 -- vet --at '$.registry.order_paid' "$V1" \
  "$DIR/data/bad/paid-zero-amount.json"
has branch out '.payload.amount_cents: constraint [conflict]'
has branch out 'expected: integer&min(1)'
has branch out '[aontu/constraint]'
ok "branch anchor: same event -> constraint at payload.amount_cents (the contrast)"

# The workaround in full: a consumer dispatch loop. Read the wire
# type, underscore the dots, vet at the registry branch.
for f in "$DIR"/data/stream/*.json; do
  wire_type="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["type"])' "$f")"
  anchor="\$.registry.${wire_type//./_}"
  run "disp-$(basename "$f" .json)" 0 -- vet --at "$anchor" "$V1" "$f"
done
ok "consumer dispatch loop: wire type -> registry anchor, all events valid"

# Unknown discriminator: byte-identical finding shape to the wrong
# payload -- an agent cannot tell 'unknown type' from 'bad payload'.
run unk 1 -- vet --at '$.Event' "$V1" "$DIR/data/bad/refunded-unknown-type.json"
has unk out '$.Event: empty [conflict]'
grep '^\$\.Event' "$WORK/unk.out" > "$WORK/unk.head"
grep '^\$\.Event' "$WORK/ubad.out" > "$WORK/ubad.head"
diff -q "$WORK/unk.head" "$WORK/ubad.head" >/dev/null \
  || fail "unknown-type and bad-payload findings now differ; gap fixed? update README"
ok "union anchor: unknown type indistinguishable from bad payload (pinned gap)"

# But an INCOMPLETE branch (missing envelope field) localises fine:
# the discriminator drops the other branches and the residue is named.
run miss 3 -- vet --at '$.Event' "$V1" "$DIR/data/bad/paid-missing-source.json"
has miss out 'verdict: incomplete'
has miss out '$.Event.source: mapval_required'
ok "union anchor: MISSING field localised precisely (incomplete != conflict)"

# GAP: dotted wire types are unaddressable -- no path spelling
# reaches a key spelled "order.placed".
run dotted 1 -- get '$.registry."order.placed"' "$V1"
has dotted err 'no_path'
ok "get: a dotted key cannot be addressed (why the registry underscores)"

# --- 4. Timestamps: RFC 3339 as re(). ---

run btime 1 -- vet --at '$.registry.order_placed' "$V1" \
  "$DIR/data/bad/placed-bad-time.json"
has btime out '.time: constraint [conflict]'
has btime out '26/08/2026 10:07'
has btime out '[aontu/constraint]'
# GAP CLOSED 2026-08-27 (finding F, BUGS.md §25). The schema site used
# to name the ENTRY file with the row/col of the included
# envelope.aon. Pinned structurally, in both directions: the row the
# finding cites holds the time pattern in the file the finding NAMES,
# and the entry file's own line of that number does not.
row="$(grep -o 'envelope.aon:[0-9]*' "$WORK/btime.out" | head -1 | cut -d: -f2)"
[ -n "$row" ] || fail "btime: schema site does not name envelope.aon"
sed -n "${row}p" "$DIR/envelope.aon" | grep -q 'time: re' \
  || fail "btime: envelope.aon:$row is not the time pattern; site pin stale"
sed -n "${row}p" "$DIR/orders-v1.aon" | grep -q 'time: re' \
  && fail "btime: orders-v1.aon:$row holds it too; the pin proves nothing" \
  || true
ok "vet: bad timestamp refused; schema site names the file it excerpts"

# The regex cannot check calendar semantics: month 13, hour 25 pass.
run month13 0 -- vet --at '$.Event' "$V1" "$DIR/data/bad/placed-month-13.json"
has month13 out 'verdict: valid'
ok "vet: 2026-13-41T25:61:61Z accepted -- no date-time type (pinned gap)"

# The natural optional-fraction spelling is refused outright.
run frac 1 -- "$DIR/probes/frac-group.aon"
has frac err '[aontu/constraint_pattern]'
has frac err 'quantifier applied to a group containing another quantifier'
ok "re(): (\\.\\d+)? outside the portable subset (pinned gap; workaround in envelope)"

# --- 5. Event ids: 19 digits, with and without 0d. ---

run idplain 1 -- vet --at '$.registry.order_paid' "$V1" \
  "$DIR/data/ids/paid-id-19digit-plain.json"
has idplain out '[aontu/lossy_integer_literal]'
lacks idplain out 'write it as'
ok "vet: plain 19-digit id refused (lossy), finding lacks the 0d advice"

# Eval of the same file DOES carry the advice -- vet drops it.
run idadvice 1 -- "$DIR/data/ids/paid-id-19digit-plain.json"
has idadvice err 'write it as a `0d`'
ok "eval: the same refusal names the 0d escape (vet finding does not)"

run id0d 0 -- vet --at '$.registry.order_paid' "$V1" \
  "$DIR/data/ids/paid-id-19digit-0d.json"
has id0d out 'verdict: valid'
ok "vet: 0d9223372036854775807 valid against (integer|biginteger)&min(1)"

# The rescued spelling is not JSON any more: no serializer emits it.
if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' \
    "$DIR/data/ids/paid-id-19digit-0d.json" 2>/dev/null; then
  fail "0d data file parsed as strict JSON; gap pin stale"
fi
ok "the 0d data file is NOT strict JSON (pinned gap: producers cannot emit it)"

# --- 6. Defaults vs enums: the two spellings. ---

# 2026-08-26: fixed by the preference admission gate (ADR-004) --
# assertions updated to the new behaviour. The disjunct spelling now
# ENFORCES the set: "9.9" is admitted by no alternative, so it vets
# invalid ([aontu/empty]); the pref_not_instance advisory rides
# along with its corrected "remaining alternative" message.
run prefenum 1 -- vet --at '$.E' "$DIR/probes/pref-enum.aon" \
  "$DIR/data/probe-v99.json"
has prefenum out 'verdict: invalid'
has prefenum out '[aontu/empty]'
has prefenum out 'pref_not_instance'
has prefenum out 'the default "1.0" is not an instance of any remaining alternative'
ok "vet: *\"1.0\"|\"1.1\" refuses \"9.9\" (fixed: the admission gate)"

# GAP CLOSED 2026-08-27: the conjunct spelling now carries its default
# under EVAL too. `(A|B) & *A` is a preference on the alternative it
# names, so it generates "1.0" instead of erroring -- the two spellings
# of enum-with-default finally agree.
run prefeval 0 -- "$DIR/probes/default-a.aon"
has prefeval out '"v": "1.0"'
ok "eval: (\"1.0\"|\"1.1\") & *\"1.0\" generates its default"

# --- 7. No in-language discriminator dispatch. ---

run mdgood 3 -- vet --at '$.Event' "$DIR/probes/match-dispatch.aon" \
  "$DIR/data/probe-placed-ok.json"
has mdgood out 'verdict: incomplete'
has mdgood out '[aontu/conjunct]'
ok "vet: match(_) dispatcher never settles (pinned gap; union stays the model)"

# --- 8. The versioned breaking gate. ---

# GAP CLOSED 2026-08-27: self-compare is compatible. The order-lines
# list template used to be reported as not comparable TO ITSELF
# (`sub_unresolved` on $...lines.&, expected and actual byte-identical),
# so a contract failed its own gate and CI had to run
# --allow-undecided, which then masks the genuine undecideds the gate
# exists to surface. Reflexivity is now a law of the walk: every value
# admits itself, residue included, compared by HASH FORM so closedness
# and the marks still count.
run brkself 0 -- breaking --against "$V1" "$V1"
has brkself out 'verdict: compatible'
lacks brkself out 'sub_unresolved'
ok "breaking: a contract is compatible with ITSELF (reflexivity)"

# Additive minor revision: reported BREAKING, because the new
# top-level definitions (OrderRefunded, registry.order_refunded) are
# read as required keys of a data shape.
run brkminor 1 -- breaking --against "$V1" "$DIR/orders-v1-1.aon"
has brkminor out 'verdict: breaking'
has brkminor out '$.OrderRefunded: compat_required_added'
ok "breaking: additive v1.1 flagged breaking (pinned gap: whole-doc compare)"

# GAP CLOSED 2026-08-27: the gate CAN be scoped to the union. Anchored
# at $.Event, the additive v1.1 revision is compatible -- which is the
# right answer, and the one the whole-document compare above cannot
# give, because a new top-level definition reads as a required key of a
# data shape. `breaking` now takes subsume's own --at.
run brkat 0 -- breaking --against "$V1" --at '$.Event' "$DIR/orders-v1-1.aon"
has brkat out 'verdict: compatible'
ok "breaking --at: the additive revision is compatible at the union"

# Major revision: the two real breaks are found, precisely.
run brkmajor 1 -- breaking --against "$V1" "$DIR/orders-v2.aon"
has brkmajor out 'verdict: breaking'
has brkmajor out '$.OrderCancelled.payload.reason: compat_required_added'
has brkmajor out 'compat_narrowed'
has brkmajor out '"GBP"'
ok "breaking: v2 refused -- required reason + narrowed currency named exactly"

# The workaround gate: per-branch subsume for types both versions
# declare (new types are additive and skipped).
run subpaid 0 -- subsume --at '$.OrderPaid' "$DIR/orders-v1-1.aon" "$V1"
has subpaid out 'verdict: subsumes'
run subcanc 0 -- subsume --at '$.OrderCancelled' "$DIR/orders-v1-1.aon" "$V1"
# 2026-08-27: OrderPlaced passes too. Its order-lines list template is
# unchanged between the versions, and reflexivity is now a law of the
# walk, so the "lines poison" that used to make this branch undecided
# is gone.
run subplaced 0 -- subsume --at '$.OrderPlaced' "$DIR/orders-v1-1.aon" "$V1"
has subplaced out 'verdict: subsumes'
run subreason 1 -- subsume --at '$.OrderCancelled' "$DIR/orders-v2.aon" "$V1"
has subreason out 'compat_required_added'
has subreason out 'reason'
ok "per-branch subsume gate: every v1.1 branch passes, v2 refused"


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 2 "$DIR/orders-v1.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 2 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/orders-v1.aon"
run docsvg 0 -- view doc --depth 2 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/orders-v1.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
