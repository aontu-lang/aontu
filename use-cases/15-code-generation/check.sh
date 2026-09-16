#!/usr/bin/env bash
# check.sh --- code generation, end to end in the language.
#
# One model, three targets, each over a different slice of it, and one
# COMPONENT TREE that an engine turns into files. Nothing here
# assembles text: each generator is a rule set (`emit`) whose `line`
# nodes carry the target's own text, `all.aon` answers the three files
# as one tree, and the goldens under expected/ are held by handing that
# tree to jostraca. This script proves the output is REAL -- the Go
# compiles, the SQL parses -- and that both ports build the same tree.
#
# Runnable from any cwd. `go` and `jostraca` are both optional -- the
# checks that need either skip with a note.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$DIR/../.."
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); echo "ok $pass - $1"; }
skip() { pass=$((pass + 1)); echo "ok $pass - $1 # SKIP"; }

# THE TREE IS THE HAND-OFF and jostraca writes the files: the seam is a
# pipe, so `tools/cmptree-check.js` requires jostraca at RUN time and
# exits 3 when it is absent. Every check below that needs BYTES skips
# with a note in that case, rather than failing where it is not
# installed -- the same rule the Go and SQL checks already follow.
tree() { $AONTU model get out --trust root "$DIR/all.aon" 2>/dev/null; }
CMP="node $REPO/tools/cmptree-check.js"
jostraca=0
tree | $CMP --out "$WORK/out" >/dev/null 2>&1 || jostraca=$?

# ----------------------------------------------------------------
# 1. ONE RUN, THREE FILES. The document answers the whole tree, and it
# names each file in order.
[ "$(tree | grep -o '"name": "[^"]*"' | sed 's/.*: "//;s/"//' | tr '\n' ' ')" = \
  "types.go types.ts schema.sql " ] \
  || fail "the tree does not name the three files in order"
ok "one run, three files: types.go, types.ts and schema.sql"

# 2. THE GOLDENS ARE HELD BY jostraca's `check`: every file's bytes
# against expected/<path>, the DO NOT EDIT banner included, since the
# banner is a line of the file and not one a script prepends.
if [ "$jostraca" = "3" ]; then
  skip "the three generated files match their goldens (no jostraca)"
else
  tree | $CMP --folder "$DIR/expected" >/dev/null 2>&1 \
    || fail "a file drifted from expected/"
  ok "the three generated files match their goldens byte for byte"
fi

# 3. THE OUTPUT IS WRITTEN, and the Go output is REAL Go: it compiles.
# A generator whose output merely looks right is a generator nobody
# trusts.
if [ "$jostraca" = "3" ]; then
  skip "the generated Go compiles (no jostraca)"
else
for f in types.go types.ts schema.sql; do
  cmp -s "$DIR/expected/$f" "$WORK/out/$f" || fail "wrote a different $f"
done
if command -v go >/dev/null 2>&1; then
  mkdir -p "$WORK/gomod" && cp "$WORK/out/types.go" "$WORK/gomod/"
  printf 'module gencheck\n\ngo 1.24\n' > "$WORK/gomod/go.mod"
  (cd "$WORK/gomod" && go build ./...) \
    || fail "the generated Go does not compile"
  ok "the three files are written, and the generated Go compiles"

  # 4. ...and gofmt WOULD change it, by aligning the struct tags. That
  # is the formatter hand-off, pinned: the generator's job is correct
  # code, the formatter's job is idiomatic layout. If this ever stops
  # being true the generator has started doing layout, which is the
  # design decision to revisit, not a test to update quietly.
  [ -n "$(cd "$WORK/gomod" && gofmt -l .)" ] \
    || fail "gofmt no longer reformats the output -- see check.sh note 4"
  ok "gofmt realigns the output: layout is the formatter's job, not ours"
else
  skip "the generated Go compiles (no go toolchain)"
  skip "gofmt realigns the output (no go toolchain)"
fi
fi

# 5. THE SQL PARSES. The column list is a fold (`join` with `,\n`), so
# the last column carries no trailing comma, and a real SQL parser
# accepts the result and creates the tables the model describes.
if [ "$jostraca" = "3" ]; then
  skip "the generated SQL parses (no jostraca)"
else
python3 - "$WORK/out/schema.sql" <<'PY'
import sqlite3, sys
sql = open(sys.argv[1]).read()
assert ",\n);" not in sql, "a trailing comma is back -- the fold regressed"
con = sqlite3.connect(":memory:")
con.executescript(sql)
have = sorted(r[0] for r in
              con.execute("select name from sqlite_master where type='table'"))
assert ["customer", "order_line"] == have, have
# `order` is reserved, which is why identifiers are quoted: the table
# is really called order_line and really has the columns the model says.
cols = [r[1] for r in con.execute('pragma table_info("order_line")')]
assert ["id", "customer_id", "total_cents"] == cols, cols
PY
ok "the generated SQL PARSES, and creates the tables the model describes"
fi

# 6. THE SLICES ARE REAL. Change only the `go` names in the model and
# the Go unit must move while the TypeScript unit must not -- each
# target reads part of the model, checked rather than asserted.
mkdir -p "$WORK/slice"
cp "$DIR"/gen-*.aon "$DIR/all.aon" "$WORK/slice/"
sed 's/"Email"/"EmailAddr"/' "$DIR/model.aon" > "$WORK/slice/model.aon"
text() {
  $AONTU model get "$1" --trust root "$2" 2>/dev/null | python3 -c '
import json, sys
n = json.load(sys.stdin)
sys.stdout.write("".join(
  k["props"].get("src", "") + ("\n" if "Line" == k["cmp"] else "")
  for k in n["children"]))'
}
text go "$WORK/slice/all.aon" > "$WORK/go2.txt"
text ts "$WORK/slice/all.aon" > "$WORK/ts2.txt"
grep -q 'EmailAddr' "$WORK/go2.txt" \
  || fail "the go slice did not reach the Go output"
cmp -s "$DIR/expected/types.ts" "$WORK/ts2.txt" \
  || fail "a change to the go slice moved the TypeScript output"
ok "slices hold: the go rename moves Go and leaves TypeScript alone"

# 7. Generation is deterministic: the same instance twice, the same
# bytes, unit by unit.
text go "$DIR/all.aon" > "$WORK/again.txt"
text go "$DIR/all.aon" > "$WORK/again2.txt"
cmp -s "$WORK/again.txt" "$WORK/again2.txt" \
  || fail "two runs of the same document differ"
ok "two runs of the same document are byte-identical"

# 8. A CLIMBING PATH IS REFUSED, and named. `render --out` was ALL OR
# NOTHING here -- it rendered the whole set before writing any of it,
# so one refusal meant no file was touched. The component road does not
# have that property: jostraca writes as it walks, so the files before
# the bad one are already on disk when it refuses. The refusal itself
# is what this checks, because it is the part that keeps a generator
# from writing outside its folder. The lost atomicity is recorded in
# UNITS-AND-TREES.1.md §6 as a cost of the migration, not hidden here.
mkdir -p "$WORK/broken"
cp "$DIR"/gen-*.aon "$DIR/model.aon" "$DIR/all.aon" "$WORK/broken/"
sed -i.bak 's#"schema.sql"#"../schema.sql"#' "$WORK/broken/gen-sql.aon"
mkdir -p "$WORK/none"
if [ "$jostraca" = "3" ]; then
  skip "a climbing file path is refused (no jostraca)"
else
  if $AONTU model get out --trust root "$WORK/broken/all.aon" 2>/dev/null \
    | $CMP --out "$WORK/none" >"$WORK/broken.err" 2>&1; then
    fail "a climbing file path was accepted"
  fi
  grep -q '\.\.' "$WORK/broken.err" \
    || fail "the refusal does not name the path: $(cat "$WORK/broken.err")"
  ok "a climbing file path is refused, and the refusal names it"
fi

# 9. --check IS RED WHEN A GOLDEN IS EDITED, naming the file: the CI
# form catches a hand edit to a generated file.
cp -r "$DIR/expected" "$WORK/drift"
printf '// edited by hand\n' >> "$WORK/drift/types.ts"
if [ "$jostraca" = "3" ]; then
  skip "the check is red when a golden is edited (no jostraca)"
else
  if tree | $CMP --folder "$WORK/drift" >"$WORK/drift.err" 2>&1; then
    fail "the check passed an edited golden"
  fi
  grep -q 'types.ts' "$WORK/drift.err" \
    || fail "the check did not name the drifted file: $(cat "$WORK/drift.err")"
  ok "the check is red when a golden is edited, and names the file"
fi

# 10. THE LOSS REPORT IS GONE, with the fragment algebra that produced
# it (UNITS-AND-TREES.1.md §6). It graded every fragment as a claim
# about a language the renderer could not parse (tier 2) and the raw
# SQL block as one it copied verbatim (tier 3), and `--strict` refused
# the latter. A component tree makes no such claim: jostraca writes the
# bytes and neither engine parses the target, so there is nothing left
# to grade. Recorded as a capability this migration costs.

# 11. ADR-001: the Go port renders the same bytes. This is the check
# that matters most for a generator -- one model must not become two
# different files depending on which engine ran -- and it now covers
# the FOLD, the dispatch and the profile as well as the lines.
if command -v go >/dev/null 2>&1; then
  GOBIN="$WORK/aontu-go"
  (cd "$REPO/go" && go build -o "$GOBIN" ./cmd/aontu) \
    || fail "could not build the Go CLI"
  for u in go ts sql; do
    "$GOBIN" model get "$u" --trust root "$DIR/all.aon" 2>/dev/null > "$WORK/$u.go.json"
    $AONTU model get "$u" --trust root "$DIR/all.aon" 2>/dev/null > "$WORK/$u.ts.json"
    diff -u "$WORK/$u.ts.json" "$WORK/$u.go.json" \
      || fail "$u: the two ports build different trees (ADR-001)"
  done
  ok "both ports build byte-identical trees for all three files"
else
  skip "both ports render byte-identical output (no go toolchain)"
fi


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
# The figure is what goes to STDOUT; the loss report goes to stderr.
$AONTU view doc --depth 3 "$DIR/model.aon" > "$WORK/doc.out" 2>/dev/null \
  || fail "the model tree did not draw"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
$AONTU view doc --depth 3 --out "$DIR/expected/diagram-doc.txt" --check \
  "$DIR/model.aon" >/dev/null 2>&1 || fail "the model tree golden is stale"
$AONTU view doc --depth 3 --as svg --out "$DIR/expected/diagram-doc.svg" \
  --check "$DIR/model.aon" >/dev/null 2>&1 || fail "the model tree SVG is stale"
ok "the model tree draws and is pinned, text and SVG"

echo "all $pass checks passed"
