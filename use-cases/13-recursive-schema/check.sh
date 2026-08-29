#!/usr/bin/env bash
# check.sh --- drive the aontu CLI over the recursive approval-chain
# vocabulary and assert every moment of a recursive schema's life
# (docs/design/RECURSION.0.md): expansion per level of data at
# evaluation, the symbolic mu-form in canon and the hash, emergent
# guardedness at generation, and vet over plain JSON at any depth.
# Runnable from any cwd.
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
    || { cat "$WORK/$name.err" >&2; fail "$name: exit $got, wanted $want"; }
}

has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}

# 1. The good model: a three-level chain against a schema whose only
# statement of depth is `then?: $.spec.Step`. The residual expands
# once per level of data, the leaf's decision falls back to the
# ranked default, and the chain ends where the data ends.
run eval 0 -- "$DIR/model.aon"
diff -u "$DIR/expected/model.json" "$WORK/eval.out" \
  || fail "model.aon output drifted from expected/model.json"
ok "model.aon generates: one expansion per level, leaf defaults apply"

# 2. Canon is the MU-FORM: finite, with the fixpoint symbolic at every
# unmet recursive position -- the instance unrolls exactly to its
# data and then says $.spec.Step, and so does the definition.
run canon 0 -- --canon "$DIR/model.aon"
has canon out '"then"?:$.spec.Step'
ok "canon: recursion renders symbolically, never unrolled"

# 3. The canon REPARSES TO ITSELF: an engine's own output is a
# document the engine accepts, and it converges to the same canon --
# the fixpoint-reference rule, order of resolution included.
cp "$WORK/canon.out" "$WORK/again.aon"
run again 0 -- --canon "$WORK/again.aon"
diff -u "$WORK/canon.out" "$WORK/again.out" \
  || fail "canon does not round-trip to itself"
ok "canon: round-trips through a reparse unchanged"

# 4. The hash pins the MU-FORM of the vocabulary -- a fixed string
# for an infinitely deep type, usable as a schema version pin. (It is
# the hash of the marked value, so it covers the hide() that canon
# deliberately elides; test/spec/recursion.tsv pins that data does
# not move a definition's hash.)
run vhash 0 -- hash "$DIR/schema.aon"
has vhash out 'aon1-7weKgKyiLJ0FoeqJsbNH-ESR1Ufeey1zg-4SATzbVQQ'
ok "hash: the recursive vocabulary pins to one finite aon1- string"

# 5. vet over PLAIN JSON, anchored at the recursive definition: the
# chain document carries no aontu syntax at all, and the schema
# checks it at every depth -- the anchored meet keeps the schema
# root for the residual's walk, so depth is not a blind spot.
run vgood 0 -- vet --at '$.spec.Step' "$DIR/schema.aon" \
  "$DIR/data/chain-good.json"
has vgood out 'verdict: valid'
ok "vet --at Step: a plain-JSON chain is checked and accepted"

# 6. The same vet refuses bad data ONE LEVEL DOWN, with both findings
# located in the schema's own namespace: the outside approver at the
# held re(), the invented decision at the enum.
run vbad 1 -- vet --at '$.spec.Step' "$DIR/schema.aon" \
  "$DIR/data/chain-bad.json"
has vbad out 'verdict: invalid'
has vbad out '$.spec.Step.then.approver: constraint [conflict]'
has vbad out '$.spec.Step.then.decision: |:empty [conflict]'
ok "vet --at Step: refused at depth, findings located in the schema"

# 7. Evaluation enforces the same truth at any depth of a full model:
# an approver outside the company two levels down is an ordinary
# located conflict at the deep instance field.
run wemail 1 -- "$DIR/bad/wrong-email-at-depth.aon"
has wemail err '[aontu/constraint]'
has wemail err 'at path $.payments_policy.chain.then.approver'
ok "wrong email at depth: located conflict, no depth blind spot"

# 8. Guardedness is EMERGENT: the engine accepts a schema whose
# recursive tail is required, and generation then refuses at the
# exact position no finite document can fill.
run rtail 1 -- "$DIR/bad/required-tail.aon"
has rtail err '[aontu/recursion_unexpanded]'
has rtail err 'at path $.doc.then.then'
ok "required tail: recursion_unexpanded where the chain ran out"

echo "all $pass checks passed"
