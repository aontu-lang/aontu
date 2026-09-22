#!/usr/bin/env bash
# rb-solar --- the Solar System API and a human UI over it, generated
# from one model by nine generators, and held to the REFERENCE's own
# validation.
#
#   ./check.sh
#
# Runnable from any cwd. Honours $AONTU (the engine command; default
# the TypeScript CLI in this repository), so the Go port runs the same
# check. The Ruby toolchain is skipped with a note when it is absent,
# rather than failing: the generation half of the check runs anywhere.

set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
AONTU="${AONTU:-node $ROOT/ts/bin/aontu.js}"
WORK="$DIR/work"
PORT="${RB_SOLAR_PORT:-8901}"

rm -rf "$WORK"
mkdir -p "$WORK"

n=0
fails=0
server_pid=""

# KILL THE SERVER BY ITS OWN PID FILE. `$!` is the subshell and
# `bin/rails server` forks puma below it, so killing either can leave
# the other holding the port -- and the next run then refuses to start,
# which is how this was found. Rails writes the pid it actually listens
# on to `tmp/pids/server.pid`; that is the one to send TERM to.
cleanup() {
  pidfile="$DIR/app/tmp/pids/server.pid"
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$(cat "$pidfile" 2>/dev/null)" 2>/dev/null || break
      sleep 1
    done
  fi
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null
    wait "$server_pid" 2>/dev/null
  fi
}
trap cleanup EXIT

ok() { n=$((n + 1)); echo "ok $n - $1"; }
fail() { n=$((n + 1)); fails=$((fails + 1)); echo "not ok $n - $1"; }
skip() { n=$((n + 1)); echo "ok $n - $1 # SKIP"; }

# --- the generators --------------------------------------------------
#
# Each is a file in the language it generates, and the byte gate holds
# what it writes against the tree committed under `app/`. A
# change to the model or a generator is a reviewable diff to `app/`; a
# hand edit to a generated file is drift the check reports.

RUBY_GENS="routes migrate seeds model api_base api_controller ui_controller"

# THE BYTES COME FROM JOSTRACA: `aontu render --check` hands the eight
# application generators' trees to the runtime as one run and holds the
# committed app to them, and the diagram generator's tree to doc/. A
# tree checked against anything else proves nothing about what a user
# gets.
drift=""
$AONTU render --check "$DIR/gen" "$DIR/app" >/dev/null 2>&1 || drift="$drift app"
$AONTU render --check --marker '%%-' "$DIR/gen/doc/erd.mmd" "$DIR/doc" >/dev/null 2>&1 \
  || drift="$drift erd"
if [ -z "$drift" ]; then
  ok "every generator writes the committed app, byte for byte"
else
  fail "the committed app is not what the generators write:$drift"
fi

# --- the generators are files in their own languages -----------------
#
# The template surface's whole claim: a generator stays valid in the
# language it generates, so its compiler parses it and an editor
# highlights it.

if command -v ruby >/dev/null 2>&1; then
  bad=""
  for g in $RUBY_GENS; do
    ruby -c "$DIR/gen/$g.rb" >/dev/null 2>&1 || bad="$bad $g.rb"
  done
  if [ -z "$bad" ]; then
    ok "all seven Ruby generators parse as Ruby (ruby -c)"
  else
    fail "a generator is not valid Ruby:$bad"
  fi
else
  skip "the Ruby generators parse as Ruby (no ruby)"
fi

bad=""
for g in $RUBY_GENS; do
  $AONTU template --check "$DIR/gen/$g.rb" >/dev/null 2>&1 || bad="$bad $g.rb"
done
$AONTU template --check --marker '%%-' "$DIR/gen/doc/erd.mmd" >/dev/null 2>&1 \
  || bad="$bad erd.mmd"
if [ -z "$bad" ]; then
  ok "every template-surface generator round-trips as a fixpoint"
else
  fail "a generator is not what the round trip answers:$bad"
fi

# --- the diagrams ----------------------------------------------------
#
# Drawn from the same model: the ER diagram by a generator, the trees and
# the value lattice by `view`. Pinned, so a model change that alters
# the shape shows up as a diff rather than as a stale picture.

# The diagram is checked with the rest, in check 1 above.

pinned=1
$AONTU view doc --depth 2 --out "$DIR/doc/model-tree.txt" --check "$DIR/model.aontu" >/dev/null 2>&1 || pinned=0
$AONTU view doc --depth 2 --as svg --out "$DIR/doc/model-tree.svg" --check "$DIR/model.aontu" >/dev/null 2>&1 || pinned=0
$AONTU view doc --depth 2 --at '$.entity.planet' --out "$DIR/doc/planet-tree.txt" --check "$DIR/model.aontu" >/dev/null 2>&1 || pinned=0
$AONTU view doc --depth 2 --at '$.entity.planet' --as svg --out "$DIR/doc/planet-tree.svg" --check "$DIR/model.aontu" >/dev/null 2>&1 || pinned=0
$AONTU view lattice --out "$DIR/doc/value-lattice.txt" --check "$DIR/model.aontu" >/dev/null 2>&1 || pinned=0
$AONTU view lattice --as svg --out "$DIR/doc/value-lattice.svg" --check "$DIR/model.aontu" >/dev/null 2>&1 || pinned=0
[ "$pinned" = 1 ] \
  && ok "the model's trees and its value lattice draw and are pinned, text and SVG" \
  || fail "a view diagram is stale"

# --- what the model states and no file uses --------------------------
#
# Coverage over the MODEL, not over the code: a field added and
# forgotten is named here rather than left to rot.
#
# `--coverage` measures ONE document's reads, and this model is read by
# eight of them -- `$.error` is dead to the controller generator and
# alive to the base one. So the measure that means anything is the
# INTERSECTION: a path no generator read at all. Each generator's dead
# set is written out, and a path present in every one of them is dead
# for the system.

# THE DEAD-MODEL REPORT IS GONE, with the `render --coverage` that answered
# it (UNITS-AND-TREES.1.md §6). It named the shallowest model paths no
# generator read, and nothing replaces it: `reaches` answers a relation
# between two paths, not what nothing reads. Recorded as a capability
# this migration costs, not as a check that moved.

# --- the model and the generators are in the agreed form -------------
#
# A GENERATOR IS FORMATTED TOO (FMT.0.md §3.14): `fmt` desugars it,
# formats the document its marker lines carry and resugars, so the
# aontu is indented after the marker and every line of output stays
# exactly where it was. Nothing here can move a line of the generated
# app -- check 1 above writes it byte for byte -- so this gate is
# about the generator being readable as the tree it is.

bad=""
$AONTU fmt --check "$DIR/model.aontu" >/dev/null 2>&1 || bad="$bad model.aontu"
$AONTU fmt --check "$DIR/gen/views.aontu" >/dev/null 2>&1 || bad="$bad views.aontu"
for g in $RUBY_GENS; do
  $AONTU fmt --check "$DIR/gen/$g.rb" >/dev/null 2>&1 || bad="$bad $g.rb"
done
$AONTU fmt --check --marker '%%-' "$DIR/gen/doc/erd.mmd" >/dev/null 2>&1 \
  || bad="$bad erd.mmd"
if [ -z "$bad" ]; then
  ok "the model and all nine generators are in the agreed form (aontu fmt)"
else
  fail "not formatted:$bad"
fi

# --- the CI job still fits the workflow it patches -------------------
#
# `ci-job.patch` adds this system's boot legs to
# `.github/workflows/build.yml`, and it is a patch rather than a block
# to paste precisely so that this question has an answer. A patch that
# no longer applies is a job nobody can turn on; it fails here rather
# than in the maintainer's terminal a month from now.
#
# It disappears when it is applied, so its absence is not a failure.

if [ ! -f "$DIR/ci-job.patch" ]; then
  skip "the CI job patch still applies (applied and removed)"
elif ! command -v git >/dev/null 2>&1 || ! (cd "$ROOT" && git rev-parse --git-dir >/dev/null 2>&1); then
  skip "the CI job patch still applies (not a git work tree)"
elif (cd "$ROOT" && git apply --check "$DIR/ci-job.patch" >/dev/null 2>&1); then
  ok "the CI job patch still applies to .github/workflows/build.yml"
else
  fail "ci-job.patch no longer applies -- regenerate it against the workflow"
fi

# --- the system boots and the reference validates it -----------------

if ! command -v ruby >/dev/null 2>&1; then
  skip "the app boots, and the reference's 20 tests pass against it (no ruby)"
  skip "the human pages answer (no ruby)"
elif ! (cd "$DIR/app" && bundle check >/dev/null 2>&1); then
  skip "the app boots, and the reference's 20 tests pass against it (run bundle install in app/)"
  skip "the human pages answer (no bundle)"
else
  export RAILS_ENV=development

  # A SERVER LEFT OVER FROM A PREVIOUS RUN would answer instead of this
  # one, from whatever state that run left behind -- the validation
  # would then be reading a database this check never built. Found the
  # hard way: four tests failed against a stale server holding the
  # results of an earlier validation run.
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/planet" 2>/dev/null; then
    fail "something is already answering on port $PORT; stop it, or set RB_SOLAR_PORT"
    echo
    echo "$fails of $n checks failed"
    exit 1
  fi

  # NOT `db:reset`. That is `db:drop` + `db:setup`, and `db:setup` LOADS
  # `db/schema.rb`, which this app gitignores: a clean checkout has the
  # migrations and no schema, so the load fails before anything runs.
  # It passed only where an earlier `db:migrate` had left a schema
  # behind, which is why CI found it the first time this leg ran there.
  # Dropping and migrating rebuilds from what IS committed.
  (cd "$DIR/app" && bin/rails db:drop db:create db:migrate db:seed \
    >"$WORK/db.log" 2>&1)
  if [ $? -ne 0 ]; then
    fail "the database would not build"
    # The log is the only account of WHY, and a CI runner is thrown away
    # with `work/` inside it. Print the tail rather than name a path
    # nobody can open.
    sed 's/^/#   /' "$WORK/db.log" | tail -20
  else
    (cd "$DIR/app" && bin/rails server -p "$PORT" -b 127.0.0.1 >"$WORK/server.log" 2>&1) &
    server_pid=$!

    up=0
    for _ in $(seq 1 40); do
      if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/planet" 2>/dev/null; then
        up=1
        break
      fi
      sleep 1
    done

    if [ "$up" != 1 ]; then
      fail "the app did not come up on port $PORT (see work/server.log)"
      skip "the human pages answer (no server)"
    else
      # THE REFERENCE'S OWN SCRIPT, unmodified, over HTTP. It takes a
      # base URL and speaks the API, which is what makes it usable
      # against an implementation in another language entirely.
      #
      # IT IS TYPESCRIPT, and it is run by `node` directly rather than
      # by a toolchain this system would then have to carry. Node
      # strips types without a flag from 22.18; older ones parse the
      # first `interface` and die with a stack trace that says nothing
      # about the version, so the version is checked here instead.
      node_ok=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.stdout.write(a>22||(a===22&&b>=18)?"yes":"no")' 2>/dev/null)
      if [ "$node_ok" != yes ]; then
        skip "the reference's 20 validation tests (node $(node --version 2>/dev/null) strips types from 22.18)"
      elif VALIDATE_BASE_URL="http://127.0.0.1:$PORT" \
           node "$DIR/ref/validate.ts" >"$WORK/validate.out" 2>&1; then
        ok "the reference's 20 validation tests pass against the generated app"
      else
        fail "the reference's validation failed (see work/validate.out)"
      fi

      # --- the reference's own Ruby SDK ------------------------------
      #
      # A client generated from the same API description, driving this
      # implementation. NOT the SDK's own suite: that runs 246 cases
      # and passes WITH THE SERVER OFF -- its live mode is lenient by
      # design and two HTTP requests reach the app in a whole run.
      # `ref/sdk_live.rb` is the same client with assertions that fail.
      if [ -n "${RB_SOLAR_SDK:-}" ] && [ -f "$RB_SOLAR_SDK/Solardemo_sdk.rb" ]; then
        if RB_SOLAR_BASE="http://127.0.0.1:$PORT" \
           ruby "$DIR/ref/sdk_live.rb" >"$WORK/sdk.out" 2>&1; then
          ok "the reference's Ruby SDK drives the generated app (13 assertions)"
        else
          fail "the Ruby SDK check failed (see work/sdk.out)"
        fi
      else
        skip "the reference's Ruby SDK drives the app (set RB_SOLAR_SDK to the reference repo's rb/)"
      fi

      # The human side of the same data.
      pages=1
      for u in / /planets/earth /planets/earth/moons /planets/earth/moons/luna; do
        code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$u")"
        [ "$code" = 200 ] || { pages=0; echo "#   $u answered $code"; }
      done
      curl -s "http://127.0.0.1:$PORT/planets/earth" | grep -q "<h1>Earth</h1>" || pages=0
      curl -s "http://127.0.0.1:$PORT/planets/earth" | grep -q "moons/luna" || pages=0

      # AND THE COLUMNS LINE UP. An index table's header row and its
      # body row are written by two dispatches, and two loops over one
      # collection can drift apart in silence -- they did: `field`
      # became a map, a map walks in sorted-key order, the body kept
      # writing the key's link cell first, and every planet's
      # `diameter` came out under a header reading `id`. The page still
      # answered 200 and still said Earth, so nothing above saw it.
      #
      # This reads the header row and Earth's row and asks what is
      # actually under `name`.
      aligned="$(curl -s "http://127.0.0.1:$PORT/planets" | node -e '
        let page = ""
        process.stdin.on("data", (d) => (page += d)).on("end", () => {
          const head = [...page.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1])
          const row = page.split("<tr>").find((r) => r.includes(">Earth<"))
          const cell = row
            ? [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1])
            : []
          const under = (name) => cell[head.indexOf(name)] || ""
          process.stdout.write(
            head.length === cell.length &&
              under("id").includes("earth") &&
              under("name").includes("Earth") &&
              under("diameter").includes("12756")
              ? "yes"
              : "no"
          )
        })' 2>/dev/null)"
      [ "$aligned" = yes ] || {
        pages=0
        echo "#   /planets: the header row and Earth's row do not line up"
      }

      [ "$pages" = 1 ] \
        && ok "the human pages answer, the columns line up, and a planet links to its moons" \
        || fail "a human page did not answer as expected"
    fi
  fi
fi

echo
if [ "$fails" = 0 ]; then
  echo "all $n checks passed"
  rm -rf "$WORK"
  exit 0
fi
echo "$fails of $n checks failed"
exit 1
