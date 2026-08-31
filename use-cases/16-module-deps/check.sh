#!/usr/bin/env bash
# check.sh --- drive the aontu CLI over the module graph and assert
# every outcome of a LAYERED, ACYCLIC dependency model: the layering
# rule enforced by nothing but unification, the graph atoms decided at
# generation, the closure question answered by `reaches`, and the
# dependency tree drawn and pinned. Runnable from any cwd.
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

draw() {
  local name="$1"; shift
  "$NODE" "$DIR/../tools/diagram.js" "$@" >"$WORK/$name" \
    || fail "$name did not render"
  diff -u "$DIR/expected/$name" "$WORK/$name" \
    || fail "$name drifted from its golden"
}

# 1. The codebase generates: twelve modules, four layers, every edge
# legal and every inverse written.
run eval 0 -- "$DIR/model.aon"
diff -u "$DIR/expected/model.json" "$WORK/eval.out" \
  || fail "model.aon output drifted from expected/model.json"
ok "model.aon generates: twelve modules, twenty-one legal edges"

# 2. The verb reports the same verdict without generating.
run rel 0 -- relations "$DIR/model.aon"
has rel out 'verdict: pass'
ok "relations: acyclic + inverse both hold across the codebase"

# 3. THE LAYERING RULE, ENFORCED BY UNIFICATION ALONE. auth is core
# and catalog is feature, so the CoreDep shape rel() flows into
# catalog says layer is core or util, and catalog's own layer says
# feature. Two disjunctions with nothing in common do not meet: the
# architecture rule refuses as an ordinary conflict, at generation,
# with both sides of it named.
run upward 1 -- "$DIR/bad/upward.aon"
has upward err '[aontu/empty]'
has upward err 'Cannot unify value: "core"|"util" with value: "feature"'
ok "upward dependency: core on feature refuses, naming both layers"

# 4. A cycle between two util modules -- legal by layer, refused by
# acyclic() -- reports at generation and from the verb, naming the
# loop it runs through.
run cyceval 1 -- "$DIR/bad/cycle.aon"
has cyceval err '[aontu/relation_cycle]'
run cycle 1 -- relations "$DIR/bad/cycle.aon"
has cycle out 'verdict: fail'
has cycle out 'cycle $.mods.bytes -> $.mods.log -> $.mods.bytes'
ok "cycle: a sideways loop refused at generation, named by the verb"

# 5. An edge whose mirror was never written refuses the same way, and
# the verb names the exact absent entry.
run noinveval 1 -- "$DIR/bad/missing-inverse.aon"
has noinveval err '[aontu/relation_inverse_missing]'
run noinv 1 -- relations "$DIR/bad/missing-inverse.aon"
has noinv out '$.mods.bytes does not list $.mods.clock under usedBy'
ok "missing inverse: refused at generation, the exact entry named"

# 6. A dependency on a module nobody wrote is decided inside the
# evaluation: it resolves or the document refuses.
run dangle 1 -- "$DIR/bad/dangling.aon"
has dangle err '[aontu/rel_unresolved]'
ok "dangling: a dependency on an absent module refuses"

# 7. The closure question over the same edges, both ways. A deployable
# reaches the leaf it never names directly; the leaf reaches nothing.
run reach 0 -- reaches '$.mods.cli' '$.mods.bytes' --relation dependsOn "$DIR/model.aon"
has reach out 'verdict: reaches'
has reach out '$.mods.cli -> $.mods.billing -> $.mods.auth -> $.mods.bytes'
run noreach 1 -- reaches '$.mods.bytes' '$.mods.cli' --relation dependsOn "$DIR/model.aon"
has noreach out 'verdict: unreachable'
ok "reaches --relation dependsOn: downstream yes, upstream no"

# 8. THE TREE. A dependency graph is a DAG, not a tree: `store` is
# reached from four modules and is drawn in full once, marked `(*)`
# everywhere after. The three deployables are the roots because
# nothing depends on them -- which the renderer DERIVES from the edge
# set rather than being told.
draw diagram-tree.txt tree --primary dependsOn "$DIR/model.aon"
[ "$(grep -c '(\*)' "$WORK/diagram-tree.txt")" -eq 9 ] \
  || fail "expected nine elided repeats in the tree"
[ "$(grep -cE '^[a-z]' "$WORK/diagram-tree.txt")" -eq 3 ] \
  || fail "expected three roots: the three deployables"
ok "the dependency tree draws: three roots, every repeat elided once"

# 9. One subtree, from a named root: what a feature module actually
# pulls in, which is the question a reviewer of that module has.
draw diagram-tree-billing.txt tree --primary dependsOn \
  --root '$.mods.billing' "$DIR/model.aon"
ok "tree --root: one module's own closure, drawn alone"

# 10. A misspelled root is refused rather than drawn: an empty tree
# and a typo look identical in a golden file.
if "$NODE" "$DIR/../tools/diagram.js" tree --primary dependsOn \
  --root '$.mods.nosuch' "$DIR/model.aon" >"$WORK/typo.out" 2>"$WORK/typo.err"
then
  fail "a --root naming no node should refuse"
fi
grep -qF 'no such node: $.mods.nosuch' "$WORK/typo.err" \
  || { cat "$WORK/typo.err" >&2; fail "the refusal does not name the root"; }
ok "tree --root: a node that does not exist refuses"

# 11. The same edges as a dependency-structure matrix, which is the
# whole surface at once where the tree is one chain at a time (Sangal
# et al., OOPSLA 2005).
draw diagram-matrix.txt matrix --primary dependsOn "$DIR/model.aon"
ok "the dependency-structure matrix draws: twelve modules square"

# 12. THE RENDERER TERMINATES ON THE MODEL THE ENGINE REFUSES. The
# cyclic document still evaluates -- the graph atoms' verdict lands at
# generation -- so a drawing tool is handed cyclic edge sets in
# practice, and marks the closing edge instead of recursing into it.
draw diagram-tree-cycle.txt tree --primary dependsOn "$DIR/bad/cycle.aon"
has_cycle="$(grep -c '(cycle)' "$WORK/diagram-tree-cycle.txt")"
[ "$has_cycle" -ge 1 ] \
  || fail "the cyclic model should draw a (cycle) mark"
ok "the tree of a cyclic model terminates, marking the closing edge"

# 13. The model answers ordinary queries about itself.
run get 0 -- get '$.mods.http.layer' "$DIR/model.aon"
has get out '"core"'
run getdir 0 -- get '$.mods.store.dir' "$DIR/model.aon"
has getdir out '"core/store"'
ok "get: layer and directory read straight off the model"

echo "all $pass checks passed"
