#!/usr/bin/env bash
# Shared truth across repos: a platform team's schema module vendored
# by hand into a consumer project.  Drives the real CLI end to end:
# cold-start tidy failure, hand-vendoring, lockfile canon pins,
# hermetic evaluation, integrity break on tamper, refactor-stable
# hashes, the inline #aon1- pin, cache resolution vs --trust root
# confinement, the mod manifest publish gate, the mod get refusal, and
# the transitive-dependency / internal-reference probes.  Expected
# failures are asserted by exit code plus a stable substring (an error
# code or the documented error wording), never by full error prose.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# All runs use a private cache so the user's real ~/.cache is never
# consulted or polluted -- and so the cache probes are controlled.
export XDG_CACHE_HOME="$TMP/xdg"

strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }

PASS=0
ok() { PASS=$((PASS + 1)); echo "ok $PASS - $1"; }
die() { echo "FAIL - $1" >&2; exit 1; }

# run NAME EXPECTED_EXIT ARGS... : combined output (ANSI stripped) in
# $TMP/NAME.out; assert the exit code.
run() {
  local name="$1" want="$2"; shift 2
  local got=0
  set +e
  $AONTU "$@" 2>&1 | strip_ansi > "$TMP/$name.out"
  got="${PIPESTATUS[0]}"
  set -e
  [ "$got" = "$want" ] || {
    sed 's/^/    /' "$TMP/$name.out" >&2
    die "$name: expected exit $want, got $got"
  }
}

has() { # has NAME PATTERN LABEL
  grep -qF -- "$2" "$TMP/$1.out" || {
    sed 's/^/    /' "$TMP/$1.out" >&2
    die "$1: missing '$2' ($3)"
  }
}

VENDORED=aontu_meta/vendor/corp.example/schemas/service@1

# ------------------------------------------------ A. hand distribution
# Pristine consumer (no vendor tree, no lockfile): the state of a repo
# that has declared a dep but received nothing yet.
APP="$TMP/app"
mkdir -p "$APP"
cp "$DIR/consumer/mod.aon" "$DIR/consumer/main.aon" "$DIR/consumer/gate.aon" "$APP/"

# Before anything is vendored or locked there is nothing to verify --
# which is a refusal, not a pass. A gate that returned ok over an empty
# lockfile would be the §32 defect wearing a different hat.
run verify-cold 1 mod verify "$APP"
has verify-cold 'verdict: unlocked' "cold verify refuses"
has verify-cold 'corp.example/schemas/service@1: not in the lockfile (run: aontu mod tidy)' \
  "unlocked names the repair, and it is a tidy not a fetch"
ok "cold start: verify exits 1 -- an uncovered project is not a verified one"

run tidy-cold 1 mod tidy "$APP"
has tidy-cold 'verdict: missing' "cold tidy reports missing"
has tidy-cold 'corp.example/schemas/service@1: not fetched (run: aontu mod get)' \
  "missing module names the fix"
[ ! -e "$APP/aontu_meta/mod-lock.aon" ] || die "cold tidy must not write a partial lockfile"
ok "cold start: tidy exits 1, names the module and the fix, writes no lockfile"

# Distribution is a copy: no fetch verb exists, so the platform tree is
# placed into the vendor store by hand, at the layout the resolver
# expects (aontu_meta/vendor/<host>/<path>@<major>/ -- documented nowhere; see
# README gap on first-contact vendoring).
mkdir -p "$APP/aontu_meta/vendor/corp.example/schemas"
cp -r "$DIR/platform/service" "$APP/$VENDORED"

run tidy 0 mod tidy "$APP"
has tidy 'verdict: ok' "tidy resolves after hand-vendoring"
diff -u "$DIR/consumer/aontu_meta/mod-lock.aon" "$APP/aontu_meta/mod-lock.aon" \
  || die "fresh lockfile differs from the committed consumer/aontu_meta/mod-lock.aon"
ok "tidy writes the lockfile; committed lockfile has not drifted"

run tidy-json 0 mod tidy --format json "$APP"
# The report embeds the CLI version; compare everything but that line.
diff -u <(grep -v '"version"' "$DIR/expected/tidy.json") \
        <(grep -v '"version"' "$TMP/tidy-json.out") \
  || die "tidy --format json differs from expected/tidy.json"
ok "tidy --format json matches golden (canon pin, v, empty oci)"

run vendor 0 mod vendor "$APP"
has vendor 'verdict: ok' "vendor verdict"
ok "vendor: already-vendored module left in place, verdict ok"

PIN="$(grep -o 'aon1-[A-Za-z0-9_-]*' "$APP/aontu_meta/mod-lock.aon")"

# ------------------------------------------- B. evaluation, hermetic
run eval1 0 "$APP/main.aon"
diff -u "$DIR/expected/consumer.json" "$TMP/eval1.out" \
  || die "consumer output differs from expected/consumer.json"
ok "consumer evaluates through aontu_meta/vendor; defaults fill; schema hidden"

run eval2 0 "$APP/main.aon"
cmp -s "$TMP/eval1.out" "$TMP/eval2.out" \
  || die "two runs of the same inputs differ (hermeticity)"
run canon1 0 --canon "$APP/main.aon"
run canon2 0 --canon "$APP/main.aon"
cmp -s "$TMP/canon1.out" "$TMP/canon2.out" \
  || die "two --canon runs differ (hermeticity)"
ok "hermetic: repeated runs are byte-identical (JSON and canon)"

run hash 0 hash "$DIR/platform/service/service.aon"
[ "$(cat "$TMP/hash.out")" = "$PIN" ] \
  || die "aontu hash of the module differs from the lockfile pin"
ok "aontu hash of the source tree equals the lockfile canon pin"

run hashform 0 hash --form "$DIR/platform/service/service.aon"
has hashform 'close({' "hash form renders closedness"
ok "hash form is semantically complete: close(...) wrapper present"

# --------------------------------------------------- C. integrity
# Tamper: flip the vendored default port 8080 -> 9090 (the silent-drift
# failure mode the canon pin exists to catch).
sed -i 's/\*8080/\*9090/' "$APP/$VENDORED/service.aon"
run tampered 1 "$APP/main.aon"
has tampered 'module integrity: corp.example/schemas/service@1' "integrity error names module"
has tampered "expected $PIN got aon1-" "integrity error names expected vs got"
ok "tampered vendored module: evaluation refused, expected vs got hashes named"

# `mod verify` is the read-only check: it recomputes every pin from the
# store, compares it against the committed lock, and writes nothing.
# This is what a CI job runs before it evaluates.
LOCK_BEFORE="$(cat "$APP/aontu_meta/mod-lock.aon")"
run verify-tamper 1 mod verify "$APP"
has verify-tamper 'verdict: mismatch' "verify refuses the tampered store"
has verify-tamper "corp.example/schemas/service@1: pinned $PIN but the store means aon1-" \
  "mismatch names pinned vs computed"
[ "$LOCK_BEFORE" = "$(cat "$APP/aontu_meta/mod-lock.aon")" ] \
  || die "mod verify must not rewrite the lockfile"
ok "mod verify: tampered store reported, exit 1, lockfile untouched"

# tidy, by contrast, is the verb whose job IS to write the lockfile, so
# it recomputes the pin as documented -- which is why verify exists.
run tidy-tamper 0 mod tidy "$APP"
PIN2="$(grep -o 'aon1-[A-Za-z0-9_-]*' "$APP/aontu_meta/mod-lock.aon")"
[ "$PIN2" != "$PIN" ] || die "expected tidy to re-pin the tampered meaning"
ok "gotcha reproduced: tidy silently re-pins tampered content (verdict ok)"

# Refactor: replace the vendored copy with the two-file reordered,
# recommented refactor.  Meaning identical, so after re-tidy the pin
# must be back to the ORIGINAL hash and evaluation must pass.
rm "$APP/$VENDORED/service.aon"
cp "$DIR/probes/refactor/service.aon" "$DIR/probes/refactor/schema.aon" "$APP/$VENDORED/"
run tidy-refactor 0 mod tidy "$APP"
PIN3="$(grep -o 'aon1-[A-Za-z0-9_-]*' "$APP/aontu_meta/mod-lock.aon")"
[ "$PIN3" = "$PIN" ] || die "refactor moved the canon pin: $PIN3 != $PIN"
run eval-refactor 0 "$APP/main.aon"
cmp -s "$TMP/eval1.out" "$TMP/eval-refactor.out" \
  || die "refactored module changed the rendered output"
ok "pin survives refactor: file split + reorder + comments, same hash, same output"

# ----------------------------------------------- D. the inline pin
# Single-file agent-sandbox mode: no mod.aon, no lockfile, the hash
# frozen in the import string itself.
INLINE="$TMP/inline"
mkdir -p "$INLINE/aontu_meta/vendor/corp.example/schemas"
cp -r "$DIR/platform/service" "$INLINE/aontu_meta/vendor/corp.example/schemas/service@1"
printf 'svc: @"corp.example/schemas/service@1#%s"\nsvc: spec: { name: "audit-log", owner: "sec-ops@corp.example" }\n' \
  "$PIN" > "$INLINE/pinned.aon"
run pin-get 0 get '$.svc.spec.port' "$INLINE/pinned.aon"
[ "$(cat "$TMP/pin-get.out")" = "8080" ] || die "inline-pinned module: wrong port"
ok "inline #aon1- pin: resolves and verifies with no mod.aon and no lockfile"

sed 's/#aon1-[A-Za-z0-9_-]*/#aon1-0000000000000000000000000000000000000000000/' \
  "$INLINE/pinned.aon" > "$INLINE/wrongpin.aon"
run pin-wrong 1 "$INLINE/wrongpin.aon"
has pin-wrong 'module integrity: corp.example/schemas/service@1' "wrong inline pin refused"
ok "wrong inline pin: module integrity error, evaluation refused"

# ------------------------------- E. cache resolution vs trust root
# Seed the (private) user cache at its canon-hash key; consumer has a
# lockfile but NO vendor tree.
mkdir -p "$XDG_CACHE_HOME/aontu/mod/$PIN"
cp "$DIR/platform/service/mod.aon" "$DIR/platform/service/service.aon" \
  "$XDG_CACHE_HOME/aontu/mod/$PIN/"
APP2="$TMP/app2"
mkdir -p "$APP2"
cp "$DIR/consumer/mod.aon" "$DIR/consumer/main.aon" "$APP2/"
mkdir -p "$APP2/aontu_meta" && cp "$DIR/consumer/aontu_meta/mod-lock.aon" "$APP2/aontu_meta/"

run cache-eval 0 "$APP2/main.aon"
cmp -s "$TMP/eval1.out" "$TMP/cache-eval.out" \
  || die "cache-resolved output differs from vendor-resolved output"
ok "user cache: module resolves from the canon-hash-keyed cache (default trust)"

run cache-root 1 --trust "root:$APP2" "$APP2/main.aon"
has cache-root 'module not fetched: corp.example/schemas/service@1' \
  "trust root ignores the cache"
ok "--trust root confinement observable: user cache NOT consulted, module missing"

run vendor-cache 0 mod vendor "$APP2"
[ -f "$APP2/$VENDORED/mod.aon" ] || die "vendor did not materialise from the cache"
run root-vendored 0 --trust "root:$APP2" "$APP2/main.aon"
cmp -s "$TMP/eval1.out" "$TMP/root-vendored.out" \
  || die "trust-root output differs after vendoring"
ok "mod vendor copies cache -> aontu_meta/vendor; --trust root then evaluates"

# Cold bootstrap: cache seeded but no lockfile.  The cache is keyed by
# hash and tidy has no hash yet, so the cache cannot seed a project.
APP3="$TMP/app3"
mkdir -p "$APP3"
cp "$DIR/consumer/mod.aon" "$DIR/consumer/main.aon" "$APP3/"
run tidy-bootstrap 1 mod tidy "$APP3"
has tidy-bootstrap 'not fetched (run: aontu mod get)' "cache cannot bootstrap"
ok "gap reproduced: seeded cache cannot bootstrap a project without a lockfile"

# ------------------------------------------ F. the publish boundary
run manifest 0 mod manifest "$DIR/platform/service"
diff -u "$DIR/expected/manifest-142.txt" "$TMP/manifest.out" \
  || die "manifest differs from expected/manifest-142.txt"
ok "mod manifest: OCI artifact description matches golden (annotations, layer)"

run gate-compat 0 mod manifest --against "$DIR/platform/service" \
  "$DIR/platform/service-next-compat"
has gate-compat 'verdict: ok' "compatible release passes"
ok "publish gate: widen replicas + optional runbook is compatible (1.4.3 ok)"

run gate-breaking 1 mod manifest --against "$DIR/platform/service" \
  "$DIR/platform/service-next-breaking"
has gate-breaking 'verdict: breaking' "breaking release refused"
has gate-breaking '$.spec.oncall: the general value requires this key' \
  "finding names the culprit key"
ok "publish gate: required oncall under major 1 refused with a located finding"

run gate-v2 0 mod manifest --against "$DIR/platform/service" \
  "$DIR/platform/service-v2"
has gate-v2 'verdict: ok' "major bump lifts the gate"
ok "publish gate: identical breaking schema allowed as 2.0.0 (major bump)"

run mod-get 2 mod get
has mod-get 'mod get needs a registry client, which this build does not ship' \
  "network verb refusal"
run mod-publish 2 mod publish
has mod-publish 'mod publish needs a registry client' "publish refusal"
ok "no network verbs: mod get / mod publish refuse with exit 2, naming the repair"

# --------------------------- G. vetting agent candidates via the module
run vet-good 0 vet --at spec "$APP/gate.aon" "$DIR/data/checkout-good.json"
has vet-good 'verdict: valid' "good candidate"
ok "vet: agent-emitted candidate valid against the vendored platform truth"

run vet-bad 1 vet --at spec "$APP/gate.aon" "$DIR/data/rogue-sidecar.json"
has vet-bad 'verdict: invalid' "bad candidate refused"
has vet-bad 'aontu/constraint' "regex constraints fire"
has vet-bad 'aontu/closed' "close() catches the rogue sidecar key"
ok "vet: rogue candidate refused -- name/owner constraints and closed() violations"

# ------------------------------- H. transitive dependencies
# The flat layout `mod vendor` writes is the layout a nested import
# reads: resolution tries every enclosing mod.aon root, not just the
# nearest one, so a dependency vendored beside its dependant is found
# (BUGS.md 31a).
TAPP="$TMP/tapp"
mkdir -p "$TAPP/aontu_meta/vendor/corp.example/schemas"
cp "$DIR/probes/transitive/app/mod.aon" "$DIR/probes/transitive/app/main.aon" "$TAPP/"
cp -r "$DIR/probes/transitive/service-dep" "$TAPP/aontu_meta/vendor/corp.example/schemas/service@1"
cp -r "$DIR/probes/transitive/common" "$TAPP/aontu_meta/vendor/corp.example/schemas/common@1"

run tidy-trans 0 mod tidy "$TAPP"
has tidy-trans 'corp.example/schemas/common@1 1.2.0' \
  "MVS selects the highest minimum (1.2.0 over 1.0.0)"
ok "MVS: common@1 selected at 1.2.0, the highest of the declared minima"

FLATPIN="$(grep -o '"corp.example/schemas/service@1":{"canon":"aon1-[A-Za-z0-9_-]*' \
  "$TAPP/aontu_meta/mod-lock.aon" | grep -o 'aon1-[A-Za-z0-9_-]*$')"

run eval-trans 0 "$TAPP/main.aon"
ok "flat-vendored transitive dep evaluates: common@1 found beside service@1"

# The pin tidy locked is a real pin: `aontu hash` -- which refuses any
# file that does not evaluate on its own -- agrees with it exactly.
run hash-trans 0 hash "$TAPP/aontu_meta/vendor/corp.example/schemas/service@1/service.aon"
[ "$(cat "$TMP/hash-trans.out")" = "$FLATPIN" ] \
  || die "aontu hash of the dep-bearing module differs from its locked pin"
ok "tidy's pin for the dep-bearing module equals what aontu hash computes"

# The old workaround -- a second vendor tree nested inside the vendored
# module -- is now a no-op: same closure, therefore the same pin.
mkdir -p "$TAPP/aontu_meta/vendor/corp.example/schemas/service@1/aontu_meta/vendor/corp.example/schemas"
cp -r "$DIR/probes/transitive/common" \
  "$TAPP/aontu_meta/vendor/corp.example/schemas/service@1/aontu_meta/vendor/corp.example/schemas/common@1"
run tidy-nested 0 mod tidy "$TAPP"
NESTPIN="$(grep -o '"corp.example/schemas/service@1":{"canon":"aon1-[A-Za-z0-9_-]*' \
  "$TAPP/aontu_meta/mod-lock.aon" | grep -o 'aon1-[A-Za-z0-9_-]*$')"
[ "$NESTPIN" = "$FLATPIN" ] \
  || die "a nested vendor tree of the same module moved the pin: $NESTPIN != $FLATPIN"
run eval-nested 0 "$TAPP/main.aon"
ok "nesting a vendor tree inside the dependency is now a no-op: same pin, same output"

# A module that cannot evaluate is not pinned at all: tidy refuses it
# rather than locking canonHash(nil), which every broken module shares.
BAPP="$TMP/bapp"
mkdir -p "$BAPP/aontu_meta/vendor/corp.example/schemas"
cp "$DIR/probes/transitive/app/mod.aon" "$DIR/probes/transitive/app/main.aon" "$BAPP/"
cp -r "$DIR/probes/transitive/service-dep" "$BAPP/aontu_meta/vendor/corp.example/schemas/service@1"
run tidy-unevaluable 4 mod tidy "$BAPP"
has tidy-unevaluable 'verdict: error' "unevaluable module is an error"
has tidy-unevaluable 'corp.example/schemas/service@1: does not evaluate on its own; nothing to pin' \
  "refusal names the module and the reason"
[ ! -e "$BAPP/aontu_meta/mod-lock.aon" ] || die "tidy must not write a lockfile it cannot fill"
ok "tidy refuses to pin a module it cannot evaluate (no canonHash(nil) pin)"

# Internal absolute refs: fine standalone, broken at a nested key.
RAPP="$TMP/rapp"
mkdir -p "$RAPP/aontu_meta/vendor/corp.example/schemas/service@1"
cp "$DIR/platform/service/mod.aon" "$RAPP/aontu_meta/vendor/corp.example/schemas/service@1/"
cp "$DIR/probes/nested-ref/service.aon" "$RAPP/aontu_meta/vendor/corp.example/schemas/service@1/"
cp "$DIR/probes/transitive/app/main.aon" "$RAPP/"
run hash-ref 0 hash "$RAPP/aontu_meta/vendor/corp.example/schemas/service@1/service.aon"
run eval-ref 1 "$RAPP/main.aon"
has eval-ref 'aontu/no_path' "internal ref breaks under nested import"
ok "gap reproduced: module-internal \$.ref evaluates standalone, no_path when nested"

# ------------------------- I. version bookkeeping is not cross-checked
APP4="$TMP/app4"
mkdir -p "$APP4/aontu_meta/vendor/corp.example/schemas"
cp "$DIR/consumer/main.aon" "$APP4/"
sed 's/"1.4.2"/"9.9.9"/' "$DIR/consumer/mod.aon" > "$APP4/mod.aon"
cp -r "$DIR/platform/service" "$APP4/$VENDORED"
run tidy-vfake 0 mod tidy "$APP4"
grep -qF '"v":"9.9.9"' "$APP4/aontu_meta/mod-lock.aon" \
  || die "expected the declared 9.9.9 to be locked verbatim"
ok "gap reproduced: lockfile records v 9.9.9 over a store tree whose mod.aon says 1.4.2"


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `get --keys --types` does, and stops at a depth that says how many
# keys it did not draw. The figure at the head of the README is this,
# and `--check` is the gate that keeps it true.
# The figure is what goes to STDOUT; the loss report goes to stderr,
# and merging the two would compare the golden against both.
$AONTU view doc --depth 3 "$DIR/consumer/main.aon" > "$TMP/doc.out" 2>/dev/null \
  || die "the model tree did not draw"
diff -u "$DIR/expected/diagram-doc.txt" "$TMP/doc.out" \
  || die "the model tree drifted"
run docgate 0 view doc --depth 3 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/consumer/main.aon"
run docsvg 0 view doc --depth 3 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/consumer/main.aon"
ok "the model tree draws and is pinned, text and SVG"
echo
echo "all $PASS checks passed"
