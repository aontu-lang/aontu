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
has canon out 'acyclic()'
ok "canon: the field-level declarations render reparseably"

# 4. A cycle refuses at GENERATION -- the atoms decide where every
# edge is known -- with a located relation_cycle on an edge of the
# loop; the verb names the entities it runs through.
run cyceval 1 -- "$DIR/bad/cycle.aon"
has cyceval err '[aontu/relation_cycle]'
run cycle 1 -- relations "$DIR/bad/cycle.aon"
has cycle out 'verdict: fail'
has cycle out 'cycle $.pipeline.jobs.extract -> $.pipeline.jobs.transform -> $.pipeline.jobs.load -> $.pipeline.jobs.extract'
ok "cycle: refused at generation, reported by the verb"

# 5. A missing inverse refuses the same way, naming the exact entry.
run noinveval 1 -- "$DIR/bad/missing-inverse.aon"
has noinveval err '[aontu/relation_inverse_missing]'
run noinv 1 -- relations "$DIR/bad/missing-inverse.aon"
has noinv out 'verdict: fail'
has noinv out '$.pipeline.jobs.metrics does not list $.pipeline.jobs.transform under fedBy'
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
ok "dangling: an address naming no node refuses"

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
run reach 0 -- reaches '$.pipeline.jobs.extract' '$.pipeline.jobs.load' --relation feeds "$DIR/model.aon"
has reach out 'verdict: reaches'
has reach out '$.pipeline.jobs.extract -> $.pipeline.jobs.transform -> $.pipeline.jobs.load'
run noreach 1 -- reaches '$.pipeline.jobs.load' '$.pipeline.jobs.extract' --relation feeds "$DIR/model.aon"
has noreach out 'verdict: unreachable'
ok "reaches --relation feeds: downstream yes, upstream no"

# 10. THE PIPELINE, DRAWN, and the inverse collapse that makes it
# readable. `graphOf` reports every WRITTEN position, so a relation
# with a declared inverse arrives twice -- `feeds` and `fedBy` give six
# edges for three logical ones. `aontu view graph` reads the relation
# declarations, so the DECLARING direction is drawn and the mirror is
# suppressed, counted in the loss report.
run graph 0 -- view graph "$DIR/model.aon"
cp "$WORK/graph.out" "$WORK/diagram-graph.mmd"
diff -u "$DIR/expected/diagram-graph.mmd" "$WORK/diagram-graph.mmd" \
  || fail "the graph diagram drifted"
# The declared inverse is not drawn twice, and the loss report says so.
has graph err 'inverse_suppressed  3'
[ "$(grep -c ' -->' "$WORK/diagram-graph.mmd")" -eq 3 ] \
  || fail "expected three logical edges after the inverse collapse"
run er 0 -- view graph --as er "$DIR/model.aon"
diff -u "$DIR/expected/diagram-er.mmd" "$WORK/er.out" \
  || fail "the entity-relationship diagram drifted"
# The matrix over the two bad documents shows the defects as glyphs:
# the missing inverse is `!`, and the cycle is the above-diagonal cell
# no ordering can remove.
run mmat 0 -- view matrix --relation feeds --order partition --closure \
  "$DIR/bad/missing-inverse.aon"
has mmat out 'transform 4 X X ! \ .'
run cmat 0 -- view matrix --relation feeds --order partition --closure \
  "$DIR/bad/cycle.aon"
has cmat out '# above-diagonal direct cells: 1'
has cmat err 'cycle_block  1  extract load transform'
ok "the pipeline draws: 6 written edges collapse to 3 logical ones"


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 3 "$DIR/model.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 3 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/model.aon"
run docsvg 0 -- view doc --depth 3 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/model.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
