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

# The tree is the engine's own verb. The goldens were pinned by the
# reference script before the verb existed, and are unchanged: they are
# the acceptance test for the port.
hasnt() {
  grep -qF -- "$3" "$WORK/$1.$2" \
    && { cat "$WORK/$1.$2" >&2; fail "$1: $2 should not contain: $3"; }
  return 0
}

view() {
  local name="$1"; shift
  $AONTU view "$@" >"$WORK/$name" \
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

# 3b. THE SAME EDGE, WRITTEN THE OTHER WAY ROUND, REFUSES TOO. It did
# not always: which target shape reached the far end of an edge used
# to depend on the order the blocks were written in, and this file
# stood here as a known miss until that was fixed (BUGS.md 69). The
# rule is a rule when it holds in every spelling, so both spellings
# are asserted.
run swapped 1 -- "$DIR/bad/upward-swapped.aon"
has swapped err '[aontu/empty]'
ok "upward dependency: refused with the blocks in either order"

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
view diagram-tree.txt tree --relation dependsOn "$DIR/model.aon"
# The same rows as SVG: the same integer grid, drawn -- so the figure
# the site shows is the figure the gate pins.
view diagram-tree.svg tree --relation dependsOn --as svg "$DIR/model.aon"
[ "$(grep -c '(\*)' "$WORK/diagram-tree.txt")" -eq 9 ] \
  || fail "expected nine elided repeats in the tree"
[ "$(grep -cE '^[a-z]' "$WORK/diagram-tree.txt")" -eq 3 ] \
  || fail "expected three roots: the three deployables"
ok "the dependency tree draws: three roots, every repeat elided once"

# 9. One subtree, from a named root: what a feature module actually
# pulls in, which is the question a reviewer of that module has.
view diagram-tree-billing.txt tree --relation dependsOn \
  --root '$.mods.billing' "$DIR/model.aon"
ok "tree --root: one module's own closure, drawn alone"

# 10. A misspelled root is refused rather than drawn: an empty tree
# and a typo look identical in a golden file.
run typo 4 -- view tree --relation dependsOn \
  --root '$.mods.nosuch' "$DIR/model.aon"
[ ! -s "$WORK/typo.out" ] || fail "a refused tree should draw nothing"
has typo err 'refer_unresolved'
has typo err '$.mods.nosuch is not a node of the dependsOn graph'
ok "tree --root: a node that does not exist refuses"

# 11. The same edges as a dependency-structure matrix, which is the
# whole surface at once where the tree is one chain at a time (Sangal
# et al., OOPSLA 2005). In partition order an acyclic relation is a
# lower triangle, and the footer counts the cells above the diagonal:
# zero IS the acyclicity proof, in the picture's own shape.
view diagram-matrix.txt matrix --relation dependsOn --order partition \
  --closure "$DIR/model.aon"
view diagram-matrix.svg matrix --relation dependsOn --order partition \
  --closure --as svg "$DIR/model.aon"
# --check is the CI gate for a committed figure, SVG included.
run svg-gate 0 -- view matrix --relation dependsOn --order partition \
  --closure --as svg --out "$DIR/expected/diagram-matrix.svg" --check \
  "$DIR/model.aon"
ok "the dependency-structure matrix draws: twelve modules square"

# 11b. THE ARCHITECTURE LAYERS, the drawing every layered codebase has
# a hand-made copy of: one band per layer, the band nothing depends on
# at the top, and the rule -- dependencies point DOWN -- read off the
# bands. The band order is DERIVED from the relation (the layer-level
# graph in partition order), so it is a function of the model and not
# of a list kept in step with it; `--layers` names it explicitly when a
# model with an upward edge cannot settle it. `# dependsOn: 19
# downward, 2 sideways, 0 upward` is the layering rule, counted.
view diagram-layer.txt layer --relation dependsOn --group-by layer \
  "$DIR/model.aon"
view diagram-layer.svg layer --relation dependsOn --group-by layer \
  --as svg "$DIR/model.aon"
# --edges all draws the relation OVER the bands: the same figure a
# reader tracing one module's dependencies wants. The default draws
# the upward edges alone, because those are the violations the bands
# cannot show on their own.
view diagram-layer-edges.svg layer --relation dependsOn --group-by layer \
  --edges all --as svg "$DIR/model.aon"
run edged 0 -- view layer --relation dependsOn --group-by layer \
  --edges all "$DIR/model.aon"
has edged out '# sideways: auth -> http'
has edged out '# downward: cli -> billing'
run bare 0 -- view layer --relation dependsOn --group-by layer \
  --edges none --as mermaid "$DIR/model.aon"
hasnt bare out ' --> '
has_golden() { grep -qF -- "$2" "$DIR/expected/$1" || fail "$1 lacks: $2"; }
has_golden diagram-layer.txt '# dependsOn: 19 downward, 2 sideways, 0 upward'
run layered 0 -- view layer --relation dependsOn --group-by layer \
  --layers app,feature,core,util --as mermaid "$DIR/model.aon"
has layered out 'subgraph g0["app"]'
ok "the architecture layers draw: four bands, every edge downward or sideways"

# 11c. THE VIEW DOCUMENT: every figure this case commits, declared as
# data in `views.aon` beside the model rather than as seven shell
# lines kept in step with it. One evaluation draws all seven, and
# `--check` is the gate -- all or nothing, so a set whose fourth
# figure refuses writes none of them. `views` is the document's own
# key and `--views` says where to look (ADR-010).
run views 0 -- view --views '$.views' --check "$DIR/views.aon"
# The same declarations, DRAWN rather than gated: a copy of the
# document in a scratch directory writes the same seven figures there,
# because every `out` is resolved against the document's own directory.
mkdir -p "$WORK/expected"
sed 's|@"./model.aon"|@"'"$DIR"'/model.aon"|' "$DIR/views.aon" > "$WORK/draw.aon"
$AONTU view --views '$.views' "$WORK/draw.aon" 2>/dev/null \
  || fail "the view document did not draw"
for figure in diagram-tree.txt diagram-tree.svg diagram-tree-billing.txt \
  diagram-matrix.txt diagram-matrix.svg diagram-layer.txt diagram-layer.svg \
  diagram-layer-edges.svg; do
  diff -u "$DIR/expected/$figure" "$WORK/expected/$figure" \
    || fail "the view document drew $figure differently"
done
ok "the view document draws and gates all eight figures in one run"

# 12. THE RENDERER TERMINATES ON THE MODEL THE ENGINE REFUSES. The
# cyclic document still evaluates -- the graph atoms' verdict lands at
# generation -- so a drawing tool is handed cyclic edge sets in
# practice, and marks the closing edge instead of recursing into it.
view diagram-tree-cycle.txt tree --relation dependsOn "$DIR/bad/cycle.aon"
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


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
run doc 0 -- view doc --depth 2 "$DIR/model.aon"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
run docgate 0 -- view doc --depth 2 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/model.aon"
run docsvg 0 -- view doc --depth 2 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/model.aon"
ok "the model tree draws and is pinned, text and SVG"
echo "all $pass checks passed"
