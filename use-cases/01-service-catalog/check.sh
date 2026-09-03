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
hasnt() {
  ! grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 unexpectedly contains: $3"; }
}
has() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    || { cat "$WORK/$1.$2" >&2; fail "$1: $2 does not contain: $3"; }
}

# 1. The whole model evaluates: two views of eight entities, joined by
# the field-level relation declarations, against the bundled
# std/system vocabulary.
run eval 0 -- "$DIR/system.aon"
diff -u "$DIR/expected/system.json" "$WORK/eval.out" \
  || fail "system.aon output drifted from expected/system.json"
ok "system.aon evaluates to the expected merged catalog"

# 2. Identity survives canonical form.
run canon 0 -- --canon "$DIR/system.aon"
has canon out 'acyclic()'
has canon out 'inverse("dependedOnBy")'
ok "canonical form keeps entity identity"

# 3. The relation checks hold on the good model.
run rel 0 -- relations "$DIR/system.aon"
has rel out 'verdict: pass'
ok "relations: dependsOn acyclic + dependedOnBy inverse both hold"

# 4. One service's slice, as an agent would pull it into context. The
# DEPLOY position is the merged one: the reference runs catalog ->
# deploy, so a workload carries the org facts as well as its own,
# while the catalog entry keeps only what the catalog states.
run slice 0 -- get '$.deploy.regions.eu1.clusters.core.workloads.payments' \
  "$DIR/system.aon"
diff -u "$DIR/expected/payments-slice.json" "$WORK/slice.out" \
  || fail "payments slice drifted"
ok "get: the deploy slice carries the catalog facts it references"

run keys 0 -- get '$.deploy.regions.eu1.clusters.core.workloads' \
  --keys "$DIR/system.aon"
diff -u "$DIR/expected/eu1-core-keys.txt" "$WORK/keys.out" \
  || fail "eu1/core workload keys drifted"
ok "get --keys: eu1/core runs the expected five workloads"

# 5. Provenance across the two views. A workload's own field names
# the deploy.aon site that wrote it...
run why1 0 -- why \
  '$.deploy.regions.eu1.clusters.core.workloads.payments.replicas' \
  "$DIR/system.aon"
has why1 out 'deploy.aon:'
ok "why: a workload's replicas is traced to deploy.aon"

# ...and a field it takes from the catalog is not SILENT: gap 9's
# "(no contributions: nothing met at this path)" over a printed value
# is gone (the review's finding E). A reference resolves by CLONING,
# and a clone of a written value IS that written value somewhere else,
# so the contribution is named at the line an author wrote.
run why2 0 -- why \
  '$.deploy.regions.eu1.clusters.core.workloads.payments.tier' \
  "$DIR/system.aon"
grep -q 'no contributions' "$WORK/why2.out" \
  && fail 'why2: silent at the deploy position' || true
ok "why: a referenced field carries its provenance to the deploy view"

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
has cycle out 'cycle $.catalog.domains.payments.services.ledger -> $.catalog.domains.payments.services.payments -> $.catalog.domains.payments.services.ledger'
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
run reach 0 -- reaches '$.catalog.domains.platform.services.gateway' '$.catalog.domains.payments.services.ledger' "$DIR/system.aon"
has reach out 'verdict: reaches'
has reach out '$.catalog.domains.platform.services.gateway -> $.catalog.domains.payments.services.payments -> $.catalog.domains.payments.services.ledger'
ok "reaches: gateway -> payments -> ledger, with the chain as evidence"

# THE DIRECTION IS THE RELATION'S, not the graph's. This model writes
# both dependsOn and its inverse, so the whole edge set is symmetric
# and EVERYTHING reaches everything: asking a directional question
# means naming the relation to follow. That is what --relation is for,
# and the difference between the two runs below is the whole point.
run reachdep 0 -- reaches '$.catalog.domains.platform.services.gateway' '$.catalog.domains.payments.services.ledger' --relation dependsOn \
  "$DIR/system.aon"
has reachdep out 'verdict: reaches'
run noreach 1 -- reaches '$.catalog.domains.payments.services.ledger' '$.catalog.domains.platform.services.gateway' --relation dependsOn \
  "$DIR/system.aon"
has noreach out 'verdict: unreachable'
ok "reaches --relation dependsOn: one way only, as the estate is layered"

# ...and an endpoint that names no entity is a REFUSAL, not a `no`:
# answering no would report a typo as a fact about the model.
run badreach 4 -- reaches '$.catalog.domains.platform.services.gateway' '$.catalog.domains.platform.services.nope' "$DIR/system.aon"
has badreach out 'refer_unresolved'
ok "reaches: an endpoint naming no entity is refused, not answered no"

# 8. A missing inverse is refused and reported the same way.
run noinveval 1 -- "$DIR/bad/missing-inverse.aon"
has noinveval err 'relation_inverse_missing'
run noinv 1 -- relations "$DIR/bad/missing-inverse.aon"
has noinv out 'verdict: fail'
has noinv out '$.catalog.domains.identity.services.directory does not list $.catalog.domains.platform.services.email under dependedOnBy'
ok "relations: missing dependedOnBy inverse refused and reported"

# 9. Two views disagreeing about one entity is an evaluation error --
# that is what the deployment view's reference is for.
run conflict 1 -- "$DIR/bad/tier-conflict.aon"
has conflict err '[aontu/scalar_value]'
ok "two views: tier 1 vs tier 2 on payments refuses to evaluate"

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
run onbget 0 -- get '$.catalog.domains.platform.services.webhooks' "$DIR/proposals/onboard-webhooks.aon"
diff -u "$DIR/expected/webhooks-proposal.json" "$WORK/onbget.out" \
  || fail "onboarded webhooks entity drifted"
ok "proposal: candidate JSON joins the model and relations still pass"

# 13. A candidate depending on an entity nobody declared cannot even
# evaluate: rel() decides existence inside one evaluation.
run badref 1 -- "$DIR/proposals/onboard-badref.aon"
has badref err '[aontu/rel_unresolved]'
ok "proposal: a dangling dependsOn address refused by rel()"

# 10. THE CATALOG, DRAWN. The same entity graph the checks above assert
# over, rendered two ways from `graphOf` alone -- node-link for the
# shape, and a dependency-structure matrix, which the empirical
# literature prefers past about twenty vertices (Ghoniem, Fekete and
# Castagliola, InfoVis 2004; Sangal et al., OOPSLA 2005). Both are
# deterministic text, so they are pinned like any other golden
# (docs/design/VIEWS.0.md). The graph groups the services by the
# generated `owner`; the matrix is in partition order with the closure
# marked, so an acyclic relation is a lower triangle. The loss report
# on stderr carries nothing but the crossing count of the emitted
# order: since ADR-014 a node is its path, so nothing is declared
# twice and no edge is collapsed.
run graph 0 -- view graph --relation dependsOn --group-by owner "$DIR/system.aon"
diff -u "$DIR/expected/diagram-graph.mmd" "$WORK/graph.out" \
  || fail "the graph diagram drifted"
has graph err 'crossings  6'
hasnt graph err 'edges_deduped'
run matrix 0 -- view matrix --relation dependsOn --order partition --closure \
  "$DIR/system.aon"
diff -u "$DIR/expected/diagram-matrix.txt" "$WORK/matrix.out" \
  || fail "the matrix diagram drifted"
has matrix out '# above-diagonal direct cells: 0'
# --check is the CI gate: the committed figure must be what the model
# draws today, and nothing is written when it is not.
run gate 0 -- view matrix --relation dependsOn --order partition --closure \
  --out "$DIR/expected/diagram-matrix.txt" --check "$DIR/system.aon"
# The same matrix as SVG -- the same cells on an integer grid -- is
# the figure the site shows, and is gated the same way.
run svg 0 -- view matrix --relation dependsOn --order partition --closure \
  --as svg "$DIR/system.aon"
diff -u "$DIR/expected/diagram-matrix.svg" "$WORK/svg.out" \
  || fail "the matrix SVG drifted"
ok "the catalog draws: node-link and dependency matrix, both pinned"


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 2 "$DIR/system.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 2 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/system.aon"
run docsvg 0 -- view doc --depth 2 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/system.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
