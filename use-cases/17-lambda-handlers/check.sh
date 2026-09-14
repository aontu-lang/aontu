#!/usr/bin/env bash
# check.sh --- twelve Lambda handlers and their index, rendered from one
# model by one rule set written in the canonical form the template
# surface desugars to (docs/design/TEMPLATE.0.md D7). What this proves:
# a value reaches a handler through `replace`, with no hole syntax;
# `esc: sq` makes it safe in the single-quoted literal it lands in; a
# line is verbatim, so two lines of two spaces survive; a dispatch over
# an empty selection is the whole conditional; `each` keeps the model's
# order and closes the name-derivation chain; and both ports render the
# same bytes.
#
# Runnable from any cwd. `go` is optional -- the parity check skips
# with a note without it.
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

# run <name> <expected-exit> -- <cli args...>
# Captures stdout+stderr in $WORK/<name>.out, asserts the exit code.
run() {
  local name="$1" want="$2"; shift 3
  local got=0
  $AONTU "$@" >"$WORK/$name.out" 2>&1 || got=$?
  [ "$got" -eq "$want" ] \
    || { cat "$WORK/$name.out" >&2; fail "$name: exit $got, wanted $want"; }
}

# has <name> <fixed-string> -- the captured output must contain it.
has() {
  grep -qF -- "$2" "$WORK/$1.out" \
    || { cat "$WORK/$1.out" >&2; fail "$1: output does not contain: $2"; }
}

# THE TREE IS THE HAND-OFF and jostraca writes the files. The seam is a
# pipe: `tools/cmptree-check.js` requires jostraca at RUN time and exits
# 3 when it is absent, so the byte checks skip with a note rather than
# failing where it is not installed.
CMP="node $REPO/tools/cmptree-check.js"
tree() { $AONTU get out --trust root "${1:-$DIR/gen.aon}" 2>/dev/null; }
jostraca=0
tree | $CMP --folder "$DIR/expected" >/dev/null 2>&1 || jostraca=$?

# ---------------------------------------------------------------------
# 1. THE GOLDENS ARE HELD by handing the tree to jostraca: thirteen
# files, twelve handlers
# and the index, byte for byte, the DO-NOT-EDIT discipline of a
# generated tree.
[ "$(ls "$DIR/expected/handlers" | wc -l)" -eq 12 ] || fail "expected twelve handlers"
if [ "$jostraca" = "3" ]; then
  skip "twelve handlers and the index match their goldens (no jostraca)"
else
  [ "$jostraca" = "0" ] || fail "a file drifted from expected/"
  ok "twelve handlers and the index match their goldens byte for byte"
fi

# 2. EVERY FILE PARSES AS TYPESCRIPT. The compiler itself over each
# file, asked for syntax alone (a TS1xxx diagnostic; the handlers
# import a module this case does not carry, and that is not a syntax
# question): a generator whose output merely looks right is one nobody
# trusts, and the escaping claim below is a claim about a parser.
"$REPO/ts/node_modules/.bin/tsc" --noEmit --skipLibCheck --target es2020 \
  --module commonjs "$DIR"/expected/handlers/*.ts "$DIR/expected/index.ts" \
  > "$WORK/tsc.out" 2>&1 || true
if grep -q "error TS1" "$WORK/tsc.out"; then
  cat "$WORK/tsc.out" >&2
  fail "a generated file has a TypeScript syntax error"
fi
ok "all thirteen files parse as TypeScript (tsc, no syntax diagnostic)"

# 3. ESCAPING IS ON. The chat service listens on a pin with an
# apostrophe, and `esc: sq` writes it as \' inside the single-quoted
# literal -- the line the compiler would otherwise reject.
grep -qF "pin:'sys:chat,user:o\\'brien'" "$DIR/expected/handlers/chat.ts" \
  || fail "the apostrophe pin is not escaped for the single-quoted literal"
ok "esc: sq escapes o'brien as o\\'brien inside the literal"

# 4. WHITESPACE IS VERBATIM: a line of two spaces is a line of two
# spaces, and a blank line is blank. No trim markers exist, because a
# marker line is never an output line.
[ "$(grep -c '^  $' "$DIR/expected/handlers/notify.ts")" -eq 2 ] \
  || fail "the two two-space lines did not survive"
[ "$(grep -c '^$' "$DIR/expected/handlers/notify.ts")" -eq 2 ] \
  || fail "the two blank lines did not survive"
ok "two two-space lines and two blank lines survive in a handler"

# 5. THE CONDITIONAL IS THE SELECTION. A service with no S3 events gets
# no gateway hook, because a dispatch over an empty filter emits
# nothing; one with an S3 event gets the hook; an SQS event is filtered
# out.
grep -qF "makeGatewayHandler('sys:ingest,cmd:file')" "$DIR/expected/handlers/ingest.ts" \
  || fail "the S3 hook is missing from ingest"
! grep -qF "makeGatewayHandler" "$DIR/expected/handlers/notify.ts" \
  || fail "notify has a gateway hook it should not have"
! grep -qF "cmd:queue" "$DIR/expected/handlers/index-build.ts" \
  || fail "the SQS event reached the S3 hook"
ok "the S3 hook appears exactly where the model has an S3 event"

# 6. THE INDEX IS IN THE MODEL'S ORDER, and the constants come out of
# the name-derivation chain: split on the hyphen, form each word
# upper, join with an underscore.
grep -qF "export const INDEX_BUILD = 'index-build'" "$DIR/expected/index.ts" \
  || fail "the chain did not spell INDEX_BUILD"
[ "$(head -1 "$DIR/expected/index.ts")" = "export const ADMIN = 'admin'" ] \
  || fail "the index does not start with admin"
[ "$(wc -l < "$DIR/expected/index.ts")" -eq 12 ] || fail "the index is not twelve lines"
ok "form keeps the order and join(each(split(...))) spells the constants"

# 7. THE TWO STATIC CHECKS refuse a drifted template before any node is
# visited: a key inside another, and a key the body does not hold.
run overlap 1 -- "$DIR/bad/overlap.aon"
has overlap '[aontu/replace_overlap]'
run unused 1 -- "$DIR/bad/unused.aon"
has unused '[aontu/replace_unused]'
ok "replace_overlap and replace_unused refuse the seeded templates"

# 8. THE CHECK IS RED WHEN A GOLDEN MOVES, and names the file.
cp -r "$DIR/expected" "$WORK/moved"
printf '// edited by hand\n' >> "$WORK/moved/handlers/chat.ts"
if [ "$jostraca" = "3" ]; then
  skip "the check is red when a handler is edited by hand (no jostraca)"
else
  if tree | $CMP --folder "$WORK/moved" >"$WORK/drift.out" 2>&1; then
    fail "the check passed an edited golden"
  fi
  grep -qF 'handlers/chat.ts' "$WORK/drift.out" \
    || fail "the check did not name the edited file"
  ok "the check is red when a handler is edited by hand, and names it"
fi

# 9. THE TRACE. Every line of every handler came from a rule, and
# `aontu trace` says which -- the `%handler` rule set by the name it was
# read through, each of the twelve services at its own path in the
# model, and `#0` for a table written inline at the call, which has no
# address of its own.
#
# The COVERAGE half of this check is gone, with `render --coverage`
# that answered it: the dead-model report has no successor (§6).
$AONTU trace --format json "$DIR/gen.aon" 2>/dev/null > "$WORK/trace.json" \
  || fail "the trace did not run"
python3 - "$WORK/trace.json" <<'PY_TRACE'
import json, sys
t = json.load(open(sys.argv[1]))["trace"]
assert 250 < len(t), len(t)
# Every entry names a file the run built, and a rule.
assert all(e["file"] for e in t)
assert all("#" in e["rule"] for e in t)
# The named rule set is addressed by its name; the twelve services are
# each matched at their own path in the model.
named = [e for e in t if e["rule"].startswith("$.%handler")]
assert 12 == len(set(e["node"] for e in named)), sorted(set(e["node"] for e in named))
assert "$.services.chat" in set(e["node"] for e in named)
# A table written inline at the call has no address of its own.
assert any("#0" == e["rule"] for e in t)
PY_TRACE
ok "the trace names the rule and the model node behind every piece"

# 10. THE TEMPLATE SURFACE (RENDER P8). handler.ts is the SAME
# generator written in the target's own syntax: the file IS a Lambda
# handler, and its marked lines are the aontu that turns one into
# twelve. It renders the same thirteen units against the same goldens,
# it parses as TypeScript with no syntax diagnostic, and the round trip
# between the two forms is a fixpoint.
# THE DESUGARED FORM IS WRITTEN BESIDE ITS SOURCE, because it carries
# the source's own relative includes: `@"./model.aon"` resolves from
# where the file sits, not from where the check runs.
$AONTU template "$DIR/handler.ts" > "$DIR/_tmpl.aon" 2>/dev/null \
  || fail "the template form did not desugar"
if [ "$jostraca" != "3" ]; then
  tree "$DIR/_tmpl.aon" | $CMP --folder "$DIR/expected" >/dev/null 2>&1 \
    || { rm -f "$DIR/_tmpl.aon"
         fail "the template form does not write the same thirteen files"; }
fi
rm -f "$DIR/_tmpl.aon"
run tmplcheck 0 -- template --check "$DIR/handler.ts"
$AONTU template "$DIR/handler.ts" > "$WORK/handler.aon" 2>/dev/null \
  || fail "the template did not desugar"
grep -q 'seneca.listen({type:.sqs.,pin:.PIN.})' "$WORK/handler.aon" \
  || fail "the canonical form lost a body line"
# The two lines that are two spaces and nothing else are output, and
# the canonical form quotes them so an editor that trims on save is
# caught (TEMPLATE.0.md D8).
[ "$(grep -c '^`  `$' "$WORK/handler.aon")" = "2" ] \
  || fail "the canonical form lost the two-space lines"
"$REPO/ts/node_modules/.bin/tsc" --noEmit --skipLibCheck --target es2020 \
  --module esnext --moduleResolution bundler "$DIR/handler.ts" 2>&1 \
  | grep -E 'error TS1[0-9]{3}' > "$WORK/tmpl-tsc.out" && {
    cat "$WORK/tmpl-tsc.out" >&2
    fail "the generator file does not parse as TypeScript"
  }
ok "the template form renders the same thirteen units, round-trips, and parses"

# 11. ADR-001: the Go port renders the same bytes, and refuses the same
# template.
if command -v go >/dev/null 2>&1; then
  GOBIN="$WORK/aontu-go"
  (cd "$REPO/go" && go build -o "$GOBIN" ./cmd/aontu) \
    || fail "could not build the Go CLI"
  "$GOBIN" get out --trust root "$DIR/gen.aon" 2>/dev/null > "$WORK/go.json" \
    || fail "the Go port did not build the tree"
  $AONTU get out --trust root "$DIR/gen.aon" 2>/dev/null > "$WORK/ts.json"
  diff -u "$WORK/ts.json" "$WORK/go.json" \
    || fail "the two ports build different trees (ADR-001)"
  "$GOBIN" "$DIR/bad/overlap.aon" >"$WORK/go-overlap.out" 2>&1 \
    && fail "the Go port accepted the overlapping keys" || true
  grep -qF '[aontu/replace_overlap]' "$WORK/go-overlap.out" \
    || fail "the Go port did not refuse replace_overlap"
  ok "the Go port builds the same thirteen files and refuses the same template"
  "$GOBIN" trace --format json "$DIR/gen.aon" 2>/dev/null > "$WORK/trace-go.json" \
    || fail "the Go port's trace did not run"
  diff -u "$WORK/trace.json" "$WORK/trace-go.json" \
    || fail "the two ports disagree about the trace (ADR-001)"
  ok "the Go port records the same trace, entry for entry"
  "$GOBIN" template --check "$DIR/handler.ts" \
    || fail "the Go port does not agree the round trip is a fixpoint"
  diff <("$GOBIN" template "$DIR/handler.ts") "$WORK/handler.aon" \
    || fail "the two ports desugar the template differently (ADR-001)"
  ok "the Go port desugars and renders the template form identically"
else
  skip "the Go port renders the same thirteen units (no go toolchain)"
  skip "the Go port records the same trace (no go toolchain)"
  skip "the Go port desugars the template form identically (no go toolchain)"
fi

echo

# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
$AONTU view doc --depth 2 "$DIR/model.aon" > "$WORK/doc.out" 2>/dev/null \
  || fail "the model tree did not draw"
diff -u "$DIR/expected/diagram-doc.txt" "$WORK/doc.out" \
  || fail "the model tree drifted"
$AONTU view doc --depth 2 --out "$DIR/expected/diagram-doc.txt" --check \
  "$DIR/model.aon" >/dev/null 2>&1 || fail "the model tree golden is stale"
$AONTU view doc --depth 2 --as svg --out "$DIR/expected/diagram-doc.svg" \
  --check "$DIR/model.aon" >/dev/null 2>&1 || fail "the model tree SVG is stale"
ok "the model tree draws and is pinned, text and SVG"

echo "all $pass checks passed"
