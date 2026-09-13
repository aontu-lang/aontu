#!/usr/bin/env bash
# check.sh --- code generation, end to end in the language.
#
# One model, three targets, each over a different slice of it, and one
# `aontu render` that turns the three units into files. Nothing here
# assembles text: each generator is a rule set (`emit`) whose pieces the
# renderer folds into bytes, `all.aon` lists the three units as one
# aontu:code instance, and the goldens under expected/ are held by
# `aontu render --check`. This script proves the output is REAL --
# the Go compiles, the SQL parses -- and that both ports render the
# same bytes.
#
# Runnable from any cwd. `go` is optional -- the checks that need it
# skip with a note.
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

# The render report lists what the renderer could not check (every
# fragment says nothing about the target's syntax) on stderr; the
# checks below read stdout and the exit code, and 2>/dev/null is that.
render() { $AONTU render --trust root "$@"; }

# ----------------------------------------------------------------
# 1. ONE RUN, THREE UNITS. The instance renders as a whole, and the
# summary names each unit with its language and size.
render "$DIR/all.aon" 2>/dev/null > "$WORK/summary.txt" \
  || fail "all.aon did not render"
[ "$(cut -f1,2 "$WORK/summary.txt" | tr '\t' ' ' | tr '\n' ' ')" = \
  "types.go go types.ts typescript schema.sql sql " ] \
  || fail "the summary does not list the three units in order: $(cat "$WORK/summary.txt")"
ok "one render, three units: types.go, types.ts and schema.sql"

# 2. THE GOLDENS ARE HELD BY --check: every unit's bytes against
# expected/<path>, the DO NOT EDIT banner included, since the banner is
# a piece of the unit and not a line a script prepends.
render --check "$DIR/expected" "$DIR/all.aon" 2>/dev/null \
  || fail "a unit drifted from expected/ (aontu render --check)"
ok "the three generated files match their goldens byte for byte"

# 3. --out WRITES THE SET, and the Go output is REAL Go: it compiles.
# A generator whose output merely looks right is a generator nobody
# trusts.
render --out "$WORK/out" "$DIR/all.aon" 2>/dev/null \
  || fail "all.aon did not write under --out"
for f in types.go types.ts schema.sql; do
  cmp -s "$DIR/expected/$f" "$WORK/out/$f" || fail "--out wrote a different $f"
done
if command -v go >/dev/null 2>&1; then
  mkdir -p "$WORK/gomod" && cp "$WORK/out/types.go" "$WORK/gomod/"
  printf 'module gencheck\n\ngo 1.24\n' > "$WORK/gomod/go.mod"
  (cd "$WORK/gomod" && go build ./...) \
    || fail "the generated Go does not compile"
  ok "--out writes the three files, and the generated Go compiles"

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

# 5. THE SQL PARSES. The column list is a fold (`join` with `,\n`), so
# the last column carries no trailing comma, and a real SQL parser
# accepts the result and creates the tables the model describes.
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

# 6. THE SLICES ARE REAL. Change only the `go` names in the model and
# the Go unit must move while the TypeScript unit must not -- each
# target reads part of the model, checked rather than asserted.
mkdir -p "$WORK/slice"
cp "$DIR"/gen-*.aon "$DIR/all.aon" "$WORK/slice/"
sed 's/"Email"/"EmailAddr"/' "$DIR/model.aon" > "$WORK/slice/model.aon"
render --unit types.go --stdout "$WORK/slice/all.aon" 2>/dev/null > "$WORK/go2.txt"
render --unit types.ts --stdout "$WORK/slice/all.aon" 2>/dev/null > "$WORK/ts2.txt"
grep -q 'EmailAddr' "$WORK/go2.txt" \
  || fail "the go slice did not reach the Go output"
cmp -s "$DIR/expected/types.ts" "$WORK/ts2.txt" \
  || fail "a change to the go slice moved the TypeScript output"
ok "slices hold: the go rename moves Go and leaves TypeScript alone"

# 7. Generation is deterministic: the same instance twice, the same
# bytes, unit by unit.
render --stdout --unit types.go "$DIR/all.aon" 2>/dev/null > "$WORK/again.txt"
render --stdout --unit types.go "$DIR/all.aon" 2>/dev/null > "$WORK/again2.txt"
cmp -s "$WORK/again.txt" "$WORK/again2.txt" \
  || fail "two runs of the same instance differ"
ok "two runs of the same instance are byte-identical"

# 8. ALL OR NOTHING. A unit path that climbs out of the output directory
# is refused before anything is written: the whole set is rendered
# first, and one refusal means no file is touched.
mkdir -p "$WORK/broken"
cp "$DIR"/gen-*.aon "$DIR/model.aon" "$DIR/all.aon" "$WORK/broken/"
sed -i.bak 's#"schema.sql"#"../schema.sql"#' "$WORK/broken/gen-sql.aon"
mkdir -p "$WORK/none"
if render --out "$WORK/none" "$WORK/broken/all.aon" >/dev/null 2>"$WORK/broken.err"; then
  fail "a climbing unit path was accepted"
fi
grep -q 'render_path' "$WORK/broken.err" \
  || fail "the refusal is not render_path: $(cat "$WORK/broken.err")"
[ -z "$(ls -A "$WORK/none")" ] \
  || fail "--out wrote files although one unit was refused"
ok "one refused unit, and --out writes nothing at all"

# 9. --check IS RED WHEN A GOLDEN IS EDITED, naming the file: the CI
# form catches a hand edit to a generated file.
cp -r "$DIR/expected" "$WORK/drift"
printf '// edited by hand\n' >> "$WORK/drift/types.ts"
if render --check "$WORK/drift" "$DIR/all.aon" >/dev/null 2>"$WORK/drift.err"; then
  fail "--check passed an edited golden"
fi
grep -q 'types.ts differs from the rendered unit' "$WORK/drift.err" \
  || fail "--check did not name the drifted unit: $(cat "$WORK/drift.err")"
ok "--check is red when a golden is edited, and names the unit"

# 10. THE LOSS REPORT SAYS WHAT WAS NOT CHECKED. Every fragment is a
# claim about a language the renderer does not parse (tier 2), and the
# SQL column block is a raw piece the renderer copies verbatim (tier
# 3), which --strict refuses: the one opaque escape in the set, named.
render --format json "$DIR/all.aon" 2>/dev/null > "$WORK/report.json" \
  || fail "the JSON report did not render"
python3 - "$WORK/report.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
assert "lossy" == r["verdict"], r["verdict"]
assert ["types.go", "types.ts", "schema.sql"] == [u["path"] for u in r["units"]]
tiers = sorted(set(l["tier"] for l in r["lossy"]))
assert [2, 3] == tiers, tiers
raw = [l for l in r["lossy"] if 3 == l["tier"]]
assert 2 == len(raw) and all("raw" == l["construct"] and "schema.sql" == l["unit"] for l in raw), raw
PY
if render --strict "$DIR/all.aon" >/dev/null 2>"$WORK/strict.err"; then
  fail "--strict accepted the raw SQL block"
fi
grep -q 'render_strict' "$WORK/strict.err" \
  || fail "--strict did not refuse as render_strict: $(cat "$WORK/strict.err")"
ok "the report names every fragment (tier 2) and the raw SQL block (tier 3); --strict refuses the block"

# 11. ADR-001: the Go port renders the same bytes. This is the check
# that matters most for a generator -- one model must not become two
# different files depending on which engine ran -- and it now covers
# the FOLD, the dispatch and the profile as well as the lines.
if command -v go >/dev/null 2>&1; then
  GOBIN="$WORK/aontu-go"
  (cd "$REPO/go" && go build -o "$GOBIN" ./cmd/aontu) \
    || fail "could not build the Go CLI"
  "$GOBIN" render --trust root --check "$DIR/expected" "$DIR/all.aon" 2>/dev/null \
    || fail "the Go port's render does not match the goldens (ADR-001)"
  for u in types.go types.ts schema.sql; do
    "$GOBIN" render --trust root --stdout --unit "$u" "$DIR/all.aon" 2>/dev/null \
      > "$WORK/$u.go.txt"
    render --stdout --unit "$u" "$DIR/all.aon" 2>/dev/null > "$WORK/$u.ts.txt"
    diff -u "$WORK/$u.ts.txt" "$WORK/$u.go.txt" \
      || fail "$u: the two ports render different bytes (ADR-001)"
  done
  ok "both ports render byte-identical output for all three units"
else
  skip "both ports render byte-identical output (no go toolchain)"
fi


# THE OTHER ROAD. The same unit written as a COMPONENT TREE. A tree is
# not rendered: it is the shape a component engine consumes, so what is
# held here is the two things that make it a generation artefact --
# the bytes it carries, and that both ports build it identically.
$AONTU "$DIR/gen-ts-cmp.aon" 2>/dev/null > "$WORK/tree.json" \
  || fail "the component tree did not evaluate"
node -e '
  const tree = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).out
  const out = []
  const walk = (n) => {
    if ("Line" === n.cmp) { out.push(n.props.src + "\n") }
    else if ("Content" === n.cmp) { out.push(n.props.src) }
    n.children.forEach(walk)
  }
  walk(tree)
  process.stdout.write(out.join(""))
' "$WORK/tree.json" > "$WORK/tree.ts" \
  || fail "the component tree could not be walked"
diff -u "$DIR/expected/types.ts" "$WORK/tree.ts" \
  || fail "the component tree carries different bytes from the aontu:code unit"
ok "a component tree carries the same bytes as the declaration spelling"

if command -v go >/dev/null 2>&1; then
  "$WORK/aontu-go" "$DIR/gen-ts-cmp.aon" 2>/dev/null > "$WORK/tree.go.json" \
    || fail "the Go port did not evaluate the component tree"
  diff -u "$WORK/tree.json" "$WORK/tree.go.json" \
    || fail "the two ports build different component trees (ADR-001)"
  ok "both ports build the component tree byte-identically"
else
  skip "both ports build the component tree (no go toolchain)"
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
