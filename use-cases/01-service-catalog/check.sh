#!/usr/bin/env bash
# check.sh --- drive the aontu CLI end to end over the service-catalog
# model and assert every outcome. Runnable from any cwd.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$DIR/../.."
NODE="${NODE:-node}"
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); echo "ok $pass - $1"; }

# run <name> <expected-exit> -- <cli args...>
# Captures stdout in $WORK/<name>.out and stderr in $WORK/<name>.err,
# asserts the exit code.
run() {
  local name="$1" want="$2"; shift 3
  local got=0
  $AONTU "$@" >"$WORK/$name.out" 2>"$WORK/$name.err" || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.err" >&2; fail "$name: exit $got, wanted $want"; }
}

# has <name> <stream> <pattern> -- grep -F the captured stream.
has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}

# 1. The whole model evaluates: two views of eight entities, joined by
# id() alone, against the bundled std/system vocabulary.
run eval 0 -- "$DIR/system.aon"
diff -u "$DIR/expected/system.json" "$WORK/eval.out" \
  || fail "system.aon output drifted from expected/system.json"
ok "system.aon evaluates to the expected merged catalog"

# 2. Identity survives canonical form.
run canon 0 -- --canon "$DIR/system.aon"
has canon out 'id("svc_payments")'
has canon out 'id("svc_email")'
ok "canonical form keeps entity identity"

# 3. The relation checks hold on the good model.
run rel 0 -- relations "$DIR/system.aon"
has rel out 'verdict: pass'
ok "relations: dependsOn acyclic + dependedOnBy inverse both hold"

# 4. One service's slice, as an agent would pull it into context.
run slice 0 -- get '$.catalog.domains.payments.services.payments' \
  "$DIR/system.aon"
diff -u "$DIR/expected/payments-slice.json" "$WORK/slice.out" \
  || fail "payments slice drifted"
ok "get: payments slice shows catalog AND deploy fields merged"

run keys 0 -- get '$.deploy.regions.eu1.clusters.core.workloads' \
  --keys "$DIR/system.aon"
diff -u "$DIR/expected/eu1-core-keys.txt" "$WORK/keys.out" \
  || fail "eu1/core workload keys drifted"
ok "get --keys: eu1/core runs the expected five workloads"

# 5. Provenance across the identity merge. The catalog position of
# replicas names the deploy.aon site that wrote it...
run why1 0 -- why '$.catalog.domains.payments.services.payments.replicas' \
  "$DIR/system.aon"
has why1 out 'deploy.aon:'
ok "why: catalog position of replicas is traced to deploy.aon"

# ...and the deploy position of tier is no longer SILENT: gap 9's
# "(no contributions: nothing met at this path)" over a printed value
# is gone (the review's finding E). What it names is the schema row
# that admits the value, in the file that declares it -- one hop short
# of the catalog.aon literal that selected it, because the id-merge
# carries the RESOLVED member into this position and the catalog's own
# meet happened at the catalog path. That narrowing is what remains of
# gap 9; the falsehood is what is fixed.
run why2 0 -- why \
  '$.deploy.regions.eu1.clusters.core.workloads.payments.tier' \
  "$DIR/system.aon"
has why2 out 'spec.aon:'
grep -q 'no contributions' "$WORK/why2.out" \
  && fail 'why2: still silent at the deploy position' || true
ok "why: deploy position of tier shows the documented one-sidedness"

# 6. Instance-of queries over the hand-built flat index.
run tier1 0 -- get '$.query.tier1' --keys "$DIR/queries/queries.aon"
diff -u "$DIR/expected/tier1-keys.txt" "$WORK/tier1.out" \
  || fail "tier1 query drifted"
run exper 0 -- get '$.query.experimental' --keys "$DIR/queries/queries.aon"
diff -u "$DIR/expected/experimental-keys.txt" "$WORK/exper.out" \
  || fail "experimental query drifted"
ok "queries: tier-1 and experimental instance sets are right"

# 7. A dependency cycle now refuses at GENERATION (RELATIONS.0.md P2:
# acyclic() decides where every edge is known), with the same finding
# the relations verb reports.
run cyceval 1 -- "$DIR/bad/cycle.aon"
has cyceval err 'relation_cycle'
run cycle 1 -- relations "$DIR/bad/cycle.aon"
has cycle out 'verdict: fail'
has cycle out 'cycle svc_payments -> svc_ledger -> svc_payments'
ok "relations: cycle payments->ledger->payments refused and reported"

# 7b. THE DECLARED ENDPOINT TYPE is rel(t)'s flow now: declared once
# on the field (bad/wrong-target.aon spells its own), it flows into
# each target, so the wrong kind is an ordinary located evaluation
# error and the verb answers error for a document that does not stand.
run wtgteval 1 -- "$DIR/bad/wrong-target.aon"
has wtgteval err '[aontu/scalar_value]'
run wtgt 4 -- relations "$DIR/bad/wrong-target.aon"
has wtgt out 'verdict: error'
ok "relations: rel(t) flow enforces the endpoint type at evaluation"

# 7c. REACHABILITY, the closure question relations cannot ask one edge
# at a time: the gateway reaches the ledger through payments, and the
# path is the answer.
run reach 0 -- reaches svc_gateway svc_ledger "$DIR/system.aon"
has reach out 'verdict: reaches'
has reach out 'svc_gateway -> svc_payments -> svc_ledger'
ok "reaches: gateway -> payments -> ledger, with the chain as evidence"

# THE DIRECTION IS THE RELATION'S, not the graph's. This model writes
# both dependsOn and its inverse, so the whole edge set is symmetric
# and EVERYTHING reaches everything: asking a directional question
# means naming the relation to follow. That is what --relation is for,
# and the difference between the two runs below is the whole point.
run reachdep 0 -- reaches svc_gateway svc_ledger --relation dependsOn \
  "$DIR/system.aon"
has reachdep out 'verdict: reaches'
run noreach 1 -- reaches svc_ledger svc_gateway --relation dependsOn \
  "$DIR/system.aon"
has noreach out 'verdict: unreachable'
ok "reaches --relation dependsOn: one way only, as the estate is layered"

# ...and an endpoint that names no entity is a REFUSAL, not a `no`:
# answering no would report a typo as a fact about the model.
run badreach 4 -- reaches svc_gateway svc_nope "$DIR/system.aon"
has badreach out 'refer_unresolved'
ok "reaches: an endpoint naming no entity is refused, not answered no"

# 8. A missing inverse is refused and reported the same way.
run noinveval 1 -- "$DIR/bad/missing-inverse.aon"
has noinveval err 'relation_inverse_missing'
run noinv 1 -- relations "$DIR/bad/missing-inverse.aon"
has noinv out 'verdict: fail'
has noinv out 'svc_directory does not list svc_email under dependedOnBy'
ok "relations: missing dependedOnBy inverse refused and reported"

# 9. Two views disagreeing about one entity is an evaluation error --
# that is what id() is for.
run conflict 1 -- "$DIR/bad/tier-conflict.aon"
has conflict err '[aontu/scalar_value]'
ok "id-merge: tier 1 vs tier 2 on svc_payments refuses to evaluate"

# 10. A typed endpoint (refer($.std.Service)) refuses a database
# target -- in the miniature model where typed refer works (gap 8).
run kind 1 -- "$DIR/bad/wrong-kind.aon"
has kind err '[aontu/scalar_value]'
has kind err '"database"'
ok "refer($.std.Service): non-service endpoint refused"

# 11. An agent-emitted candidate is vetted against the (reference-free,
# see gap 2) CandidateShape anchor.
run vetok 0 -- vet --at '$.spec.CandidateShape' "$DIR/system.aon" \
  "$DIR/data/candidate-webhooks.json"
has vetok out 'verdict: valid'
ok "vet: well-formed candidate accepted"

run vetbad 1 -- vet --at '$.spec.CandidateShape' --closed \
  "$DIR/system.aon" "$DIR/data/candidate-malformed.json"
has vetbad out 'verdict: invalid'
has vetbad out '[aontu/constraint]'
has vetbad out '[aontu/closed]'
ok "vet --closed: bad owner, short description, misspelled key all caught"

# 12. The accepted candidate merges into the live model; refer() and
# the relation checks then hold over catalog + proposal together.
run onboard 0 -- "$DIR/proposals/onboard-webhooks.aon"
run onbrel 0 -- relations "$DIR/proposals/onboard-webhooks.aon"
has onbrel out 'verdict: pass'
run onbget 0 -- get '$.proposal.webhooks' "$DIR/proposals/onboard-webhooks.aon"
diff -u "$DIR/expected/webhooks-proposal.json" "$WORK/onbget.out" \
  || fail "onboarded webhooks entity drifted"
ok "proposal: candidate JSON joins the model and relations still pass"

# 13. A candidate depending on an entity nobody declared cannot even
# evaluate: rel() decides existence inside one evaluation.
run badref 1 -- "$DIR/proposals/onboard-badref.aon"
has badref err '[aontu/rel_unresolved]'
ok "proposal: dangling dependsOn svc_searchx refused by rel()"

# 10. THE CATALOG, DRAWN. The same entity graph the checks above assert
# over, rendered two ways from `graphOf` alone -- node-link for the
# shape, and a dependency-structure matrix, which the empirical
# literature prefers past about twenty vertices (Ghoniem, Fekete and
# Castagliola, InfoVis 2004; Sangal et al., OOPSLA 2005). Both are
# deterministic text, so they are pinned like any other golden. There
# is no `aontu view` verb yet -- see docs/design/VIEWS.0.md -- so this
# uses the shipped library through use-cases/tools/diagram.js.
"$NODE" "$DIR/../tools/diagram.js" graph --primary dependsOn \
  "$DIR/system.aon" > "$WORK/diagram-graph.mmd" \
  || fail "graph diagram did not render"
diff -u "$DIR/expected/diagram-graph.mmd" "$WORK/diagram-graph.mmd" \
  || fail "the graph diagram drifted"
"$NODE" "$DIR/../tools/diagram.js" matrix --primary dependsOn \
  "$DIR/system.aon" > "$WORK/diagram-matrix.txt" \
  || fail "matrix diagram did not render"
diff -u "$DIR/expected/diagram-matrix.txt" "$WORK/diagram-matrix.txt" \
  || fail "the matrix diagram drifted"
ok "the catalog draws: node-link and dependency matrix, both pinned"

echo "all $pass checks passed"
