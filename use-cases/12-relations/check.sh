#!/usr/bin/env bash
# check.sh --- drive the aontu CLI over the pipeline model and assert
# every outcome of the field-declared relations (RELATIONS.0.md):
# rel(t) + re() + acyclic() + inverse(n) once in the schema, plain
# lists in the data, the verdict at generation, the report at the
# verb. Runnable from any cwd.
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

# 1. The good model: a four-job DAG, both directions written out,
# every list plain. The atoms hold, so generation succeeds and the
# links are the strings the author wrote.
run eval 0 -- "$DIR/model.aon"
diff -u "$DIR/expected/model.json" "$WORK/eval.out" \
  || fail "model.aon output drifted from expected/model.json"
ok "model.aon generates: atoms hold, links stay plain strings"

# 2. The verb reports the same verdict without generating.
run rel 0 -- relations "$DIR/model.aon"
has rel out 'verdict: pass'
ok "relations: acyclic + inverse both hold on the good model"

# 3. The declarations survive canonical form: rel, the held re(), and
# both atoms render at the field, so a reparse re-registers them.
run canon 0 -- --canon "$DIR/model.aon"
has canon out 'acyclic()'
has canon out 'inverse("fedBy")'
has canon out 're("^job_")'
ok "canon: the field-level declarations render reparseably"

# 4. A cycle refuses at GENERATION -- the atoms decide where every
# edge is known -- with a located relation_cycle on an edge of the
# loop; the verb names the entities it runs through.
run cyceval 1 -- "$DIR/bad/cycle.aon"
has cyceval err '[aontu/relation_cycle]'
run cycle 1 -- relations "$DIR/bad/cycle.aon"
has cycle out 'verdict: fail'
has cycle out 'cycle job_extract -> job_transform -> job_load -> job_extract'
ok "cycle: refused at generation, reported by the verb"

# 5. A missing inverse refuses the same way, naming the exact entry.
run noinveval 1 -- "$DIR/bad/missing-inverse.aon"
has noinveval err '[aontu/relation_inverse_missing]'
run noinv 1 -- relations "$DIR/bad/missing-inverse.aon"
has noinv out 'verdict: fail'
has noinv out 'job_metrics does not list job_transform under fedBy'
ok "missing inverse: refused at generation, the exact entry named"

# 6. The endpoint type is rel(t)'s flow: a feeds edge landing on a
# non-job is an ordinary located evaluation error, and the verb
# answers error for a document that does not stand up.
run wkeval 1 -- "$DIR/bad/wrong-kind.aon"
has wkeval err '[aontu/scalar_value]'
run wk 4 -- relations "$DIR/bad/wrong-kind.aon"
has wk out 'verdict: error'
ok "wrong kind: rel(t) flow refuses at evaluation, verb answers error"

# 7. A dangling address is decided inside the evaluation: it resolves
# or the document refuses, there is no later.
run dangle 1 -- "$DIR/bad/dangling.aon"
has dangle err '[aontu/rel_unresolved]'
ok "dangling: an address naming no entity refuses"

# 8. An append from a separate position converts like the originals:
# the rewrite installed its leaf constraint as the list's element
# spread, so the proposal's new consumer links, mirrors, and the
# whole model still generates.
run append 0 -- "$DIR/proposals/append.aon"
diff -u "$DIR/expected/append.json" "$WORK/append.out" \
  || fail "append proposal output drifted"
run apprel 0 -- relations "$DIR/proposals/append.aon"
has apprel out 'verdict: pass'
ok "append: a patched-in element converts and the relations still hold"

# 9. Reachability over the same edges: the DAG answers directionally.
run reach 0 -- reaches job_extract job_load --relation feeds "$DIR/model.aon"
has reach out 'verdict: reaches'
has reach out 'job_extract -> job_transform -> job_load'
run noreach 1 -- reaches job_load job_extract --relation feeds "$DIR/model.aon"
has noreach out 'verdict: unreachable'
ok "reaches --relation feeds: downstream yes, upstream no"

# 10. THE PIPELINE, DRAWN, and the inverse collapse that makes it
# readable. `graphOf` reports every WRITTEN position, so a relation
# with a declared inverse arrives twice -- `feeds` and `fedBy` give six
# edges for three logical ones. The renderer collapses each unordered
# pair and draws the named primary, which is why `--primary feeds`
# is passed: without it the code-point-least key wins and the pipeline
# reads backwards. The proper rule -- draw the DECLARING direction --
# needs the relation declarations, and relation.ts exports findings
# rather than declarations.
"$NODE" "$DIR/../tools/diagram.js" graph --primary feeds \
  "$DIR/model.aon" > "$WORK/diagram-graph.mmd" \
  || fail "graph diagram did not render"
diff -u "$DIR/expected/diagram-graph.mmd" "$WORK/diagram-graph.mmd" \
  || fail "the graph diagram drifted"
[ "$(grep -c ' -->' "$WORK/diagram-graph.mmd")" -eq 3 ] \
  || fail "expected three logical edges after the inverse collapse"
"$NODE" "$DIR/../tools/diagram.js" er --primary feeds \
  "$DIR/model.aon" > "$WORK/diagram-er.mmd" \
  || fail "er diagram did not render"
diff -u "$DIR/expected/diagram-er.mmd" "$WORK/diagram-er.mmd" \
  || fail "the entity-relationship diagram drifted"
ok "the pipeline draws: 6 written edges collapse to 3 logical ones"

echo "all $pass checks passed"
