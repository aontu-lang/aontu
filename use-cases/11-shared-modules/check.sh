#!/usr/bin/env bash
# Shared truth across repos: a platform team's schema package, first
# vendored by hand into a consumer project, then published into a local
# repository and acquired from it. Drives the real CLI end to end:
# cold-start refusals, hand-vendoring, the three lockfile pins, hermetic
# evaluation, integrity breaks on tamper, refactor-stable hashes, the
# inline #aon1- pin, cache resolution against --trust root confinement,
# the publish gate, a served repository with sync/get/why/outdated, a
# moved package, and the transitive-dependency probes. Expected failures
# are asserted by exit code plus a stable substring (an error code or
# the documented error wording), never by full error prose.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"

TMP="$(mktemp -d)"
SERVE_PID=""
cleanup() {
  [ -z "$SERVE_PID" ] || kill "$SERVE_PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

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

hasnt() { # hasnt NAME PATTERN LABEL
  grep -qF -- "$2" "$TMP/$1.out" && {
    sed 's/^/    /' "$TMP/$1.out" >&2
    die "$1: unexpected '$2' ($3)"
  }
  return 0
}

VENDORED=aontu_meta/vendor/corp.example/schemas/service
PKG=corp.example/schemas/service

# ------------------------------------------------ A. hand distribution
# Pristine consumer (no vendor tree, no lockfile): the state of a repo
# that has declared a dep but received nothing yet.
APP="$TMP/app"
mkdir -p "$APP"
cp "$DIR/consumer/pkg.aontu" "$DIR/consumer/main.aontu" "$DIR/consumer/gate.aontu" "$APP/"

# Before anything is vendored or locked there is nothing to verify --
# which is a refusal, not a pass. A gate that returned ok over an empty
# lockfile would be the §32 defect wearing a different hat.
run verify-cold 1 pkg verify "$APP"
has verify-cold 'verdict: unlocked' "cold verify refuses"
has verify-cold "$PKG: not in the lockfile (run: aontu sync)" \
  "unlocked names the repair"
ok "cold start: verify exits 1 -- an uncovered project is not a verified one"

run tidy-cold 1 pkg tidy "$APP"
has tidy-cold 'verdict: missing' "cold tidy reports missing"
has tidy-cold "$PKG: not fetched (run: aontu sync)" "missing package names the fix"
[ ! -e "$APP/aontu_meta/pkg-lock.aontu" ] || die "cold tidy must not write a partial lockfile"
ok "cold start: tidy exits 1, names the package and the fix, writes no lockfile"

# Distribution by copy: the platform tree is placed into the vendor
# store by hand, at the layout the resolver expects
# (aontu_meta/vendor/<path>/, one directory per element).
mkdir -p "$APP/aontu_meta/vendor/corp.example/schemas"
cp -r "$DIR/platform/service" "$APP/$VENDORED"

run sync 0 sync "$APP"
has sync 'verdict: ok' "sync resolves after hand-vendoring"
hasnt sync 'fetched:' "a vendored package is not fetched"
diff -u "$DIR/consumer/aontu_meta/pkg-lock.aontu" "$APP/aontu_meta/pkg-lock.aontu" \
  || die "fresh lockfile differs from the committed consumer/aontu_meta/pkg-lock.aontu"
ok "sync writes the lockfile; committed lockfile has not drifted"

run tidy-json 0 pkg tidy --format json "$APP"
# The report embeds the CLI version; compare everything but that line.
diff -u <(grep -v '"version"' "$DIR/expected/tidy.json") \
        <(grep -v '"version"' "$TMP/tidy-json.out") \
  || die "tidy --format json differs from expected/tidy.json"
ok "tidy --format json matches golden (canon and archive pins, v)"

run vendor 0 pkg vendor "$APP"
has vendor 'verdict: ok' "vendor verdict"
ok "vendor: already-vendored package left in place, verdict ok"

PIN="$(grep -o 'aon1-[A-Za-z0-9_-]*' "$APP/aontu_meta/pkg-lock.aontu")"
ARCHIVE="$(grep -o 'sha256:[0-9a-f]*' "$APP/aontu_meta/pkg-lock.aontu")"

# ------------------------------------------- B. evaluation, hermetic
run eval1 0 "$APP/main.aontu"
diff -u "$DIR/expected/consumer.json" "$TMP/eval1.out" \
  || die "consumer output differs from expected/consumer.json"
ok "consumer evaluates through aontu_meta/vendor; defaults fill; schema hidden"

run eval2 0 "$APP/main.aontu"
cmp -s "$TMP/eval1.out" "$TMP/eval2.out" \
  || die "two runs of the same inputs differ (hermeticity)"
run canon1 0 --canon "$APP/main.aontu"
run canon2 0 --canon "$APP/main.aontu"
cmp -s "$TMP/canon1.out" "$TMP/canon2.out" \
  || die "two --canon runs differ (hermeticity)"
ok "hermetic: repeated runs are byte-identical (JSON and canon)"

run hash 0 hash "$DIR/platform/service/service.aontu"
[ "$(cat "$TMP/hash.out")" = "$PIN" ] \
  || die "aontu hash of the module differs from the lockfile pin"
ok "aontu hash of the source tree equals the lockfile canon pin"

run hashform 0 hash --form "$DIR/platform/service/service.aontu"
has hashform 'close({' "hash form renders closedness"
ok "hash form is semantically complete: close(...) wrapper present"

# --------------------------------------------------- C. integrity
# Tamper: flip the vendored default port 8080 -> 9090 (the silent-drift
# failure mode the canon pin exists to catch).
sed -i 's/\*8080/\*9090/' "$APP/$VENDORED/service.aontu"
run tampered 1 "$APP/main.aontu"
has tampered "module integrity: $PKG" "integrity error names the module"
has tampered "expected $PIN got aon1-" "integrity error names expected vs got"
ok "tampered vendored module: evaluation refused, expected vs got hashes named"

# `pkg verify` is the read-only check: bytes before meaning. It is the
# archive pin that speaks first, because the files changed; the
# lockfile is untouched. This is what a CI job runs before it evaluates.
LOCK_BEFORE="$(cat "$APP/aontu_meta/pkg-lock.aontu")"
run verify-tamper 1 pkg verify "$APP"
has verify-tamper 'verdict: mismatch' "verify refuses the tampered store"
has verify-tamper "$PKG: pinned archive $ARCHIVE but the store holds sha256:" \
  "mismatch names pinned vs held bytes"
[ "$LOCK_BEFORE" = "$(cat "$APP/aontu_meta/pkg-lock.aontu")" ] \
  || die "pkg verify must not rewrite the lockfile"
ok "pkg verify: tampered store reported on the archive pin, exit 1, lockfile untouched"

# sync --frozen is the same gate with the fetch step: it says what
# would change and writes nothing.
run frozen-tamper 1 sync --frozen "$APP"
has frozen-tamper 'verdict: frozen' "frozen refuses the tampered store"
has frozen-tamper "lockfile would change: $PKG: repinned" "frozen names the pin"
[ "$LOCK_BEFORE" = "$(cat "$APP/aontu_meta/pkg-lock.aontu")" ] \
  || die "sync --frozen must not rewrite the lockfile"
ok "sync --frozen: a pin that would move is refused, lockfile untouched"

# tidy, by contrast, is the verb whose job IS to write the lockfile, so
# it recomputes the pins as documented -- which is why verify exists.
run tidy-tamper 0 pkg tidy "$APP"
PIN2="$(grep -o 'aon1-[A-Za-z0-9_-]*' "$APP/aontu_meta/pkg-lock.aontu")"
[ "$PIN2" != "$PIN" ] || die "expected tidy to re-pin the tampered meaning"
ok "gotcha reproduced: tidy silently re-pins tampered content (verdict ok)"

# Refactor: replace the vendored copy with the two-file reordered,
# recommented refactor.  Meaning identical, so after re-sync the canon
# pin must be back to the ORIGINAL hash and evaluation must pass; the
# archive pin moves, because the bytes did.
rm "$APP/$VENDORED/service.aontu"
cp "$DIR/probes/refactor/service.aontu" "$DIR/probes/refactor/schema.aontu" "$APP/$VENDORED/"
run sync-refactor 0 sync "$APP"
PIN3="$(grep -o 'aon1-[A-Za-z0-9_-]*' "$APP/aontu_meta/pkg-lock.aontu")"
[ "$PIN3" = "$PIN" ] || die "refactor moved the canon pin: $PIN3 != $PIN"
ARCHIVE3="$(grep -o 'sha256:[0-9a-f]*' "$APP/aontu_meta/pkg-lock.aontu")"
[ "$ARCHIVE3" != "$ARCHIVE" ] || die "a refactor that changed the bytes kept the archive pin"
run eval-refactor 0 "$APP/main.aontu"
cmp -s "$TMP/eval1.out" "$TMP/eval-refactor.out" \
  || die "refactored module changed the rendered output"
ok "canon pin survives refactor: file split + reorder + comments, same hash, same output; archive pin moves"

# ----------------------------------------------- D. the inline pin
# Single-file agent-sandbox mode: no pkg.aontu, no lockfile, the hash
# frozen in the import string itself.
INLINE="$TMP/inline"
mkdir -p "$INLINE/aontu_meta/vendor/corp.example/schemas"
cp -r "$DIR/platform/service" "$INLINE/aontu_meta/vendor/corp.example/schemas/service"
printf 'svc: @"%s#%s"\nsvc: spec: { name: "audit-log", owner: "sec-ops@corp.example" }\n' \
  "$PKG" "$PIN" > "$INLINE/pinned.aontu"
run pin-get 0 model get '$.svc.spec.port' "$INLINE/pinned.aontu"
[ "$(cat "$TMP/pin-get.out")" = "8080" ] || die "inline-pinned module: wrong port"
ok "inline #aon1- pin: resolves and verifies with no pkg.aontu and no lockfile"

sed 's/#aon1-[A-Za-z0-9_-]*/#aon1-0000000000000000000000000000000000000000000/' \
  "$INLINE/pinned.aontu" > "$INLINE/wrongpin.aontu"
run pin-wrong 1 "$INLINE/wrongpin.aontu"
has pin-wrong "module integrity: $PKG" "wrong inline pin refused"
ok "wrong inline pin: module integrity error, evaluation refused"

# A local file needs a ./ prefix: a bare name with an extension is
# refused with the repair, not routed anywhere.
printf 'x: @"config.json"\n' > "$INLINE/bare.aontu"
run bare-local 1 "$INLINE/bare.aontu"
has bare-local 'local files need a ./ prefix' "the module_local refusal names the repair"
ok "a bare file reference is refused: local files need a ./ prefix"

# ------------------------------- E. cache resolution vs trust root
# Seed the (private) user cache at its (canon-hash, package) key;
# consumer has a lockfile but NO vendor tree.
STORE="$XDG_CACHE_HOME/aontu/pkg/store/$PIN/corp.example/schemas/service"
mkdir -p "$STORE"
cp "$DIR/platform/service/pkg.aontu" "$DIR/platform/service/service.aontu" "$STORE/"
APP2="$TMP/app2"
mkdir -p "$APP2/aontu_meta"
cp "$DIR/consumer/pkg.aontu" "$DIR/consumer/main.aontu" "$APP2/"
cp "$DIR/consumer/aontu_meta/pkg-lock.aontu" "$APP2/aontu_meta/"

run cache-eval 0 "$APP2/main.aontu"
cmp -s "$TMP/eval1.out" "$TMP/cache-eval.out" \
  || die "cache-resolved output differs from vendor-resolved output"
ok "user cache: module resolves from the (canon-hash, package) keyed store (default trust)"

run cache-root 1 --trust "root:$APP2" "$APP2/main.aontu"
has cache-root "module not fetched: $PKG" "trust root ignores the cache"
ok "--trust root confinement observable: user cache NOT consulted, module missing"

run vendor-cache 0 pkg vendor "$APP2"
[ -f "$APP2/$VENDORED/pkg.aontu" ] || die "vendor did not materialise from the cache"
run root-vendored 0 --trust "root:$APP2" "$APP2/main.aontu"
cmp -s "$TMP/eval1.out" "$TMP/root-vendored.out" \
  || die "trust-root output differs after vendoring"
ok "pkg vendor copies cache -> aontu_meta/vendor; --trust root then evaluates"

# Cold bootstrap: cache seeded but no lockfile.  The store is keyed by
# hash and tidy has no hash yet, so the cache cannot seed a project.
APP3="$TMP/app3"
mkdir -p "$APP3"
cp "$DIR/consumer/pkg.aontu" "$DIR/consumer/main.aontu" "$APP3/"
run tidy-bootstrap 1 pkg tidy "$APP3"
has tidy-bootstrap 'not fetched (run: aontu sync)' "cache cannot bootstrap"
ok "the seeded cache cannot bootstrap a project without a lockfile; sync fetches, tidy does not"

# The verbs that write the cache refuse under a confinement root, which
# does not reach it.
run sync-confined 2 sync --trust root "$APP3"
has sync-confined 'reads and writes the user cache' "confined sync refuses"
ok "sync under --trust root refuses: the cache is outside the confinement"

# ------------------------------------------ F. the publish boundary
run manifest 0 pkg manifest "$DIR/platform/service"
diff -u "$DIR/expected/manifest-142.txt" "$TMP/manifest.out" \
  || die "manifest differs from expected/manifest-142.txt"
ok "pkg manifest: the signed manifest a publish sends matches golden (archive, module, files)"

run gate-compat 0 pkg manifest --against "$DIR/platform/service" \
  "$DIR/platform/service-next-compat"
has gate-compat 'verdict: ok' "compatible release passes"
ok "publish gate: widen replicas + optional runbook is compatible (1.4.3 ok)"

run gate-breaking 1 pkg manifest --against "$DIR/platform/service" \
  "$DIR/platform/service-next-breaking"
has gate-breaking 'verdict: breaking' "breaking release refused"
has gate-breaking '$.spec.oncall: the general value requires this key' \
  "finding names the culprit key"
ok "publish gate: required oncall refused with a located finding; no version lifts the gate"

run manifest-service2 0 pkg manifest "$DIR/platform/service2"
has manifest-service2 'corp.example/schemas/service2 1.0.0 public' "a new path mints"
ok "a breaking change ships as a new package path, which has no predecessor to gate against"

# --------------------------------- G. a repository, served and synced
# The platform team publishes into a local repository: a directory that
# `pkg serve` serves. The key is minted here and never leaves $TMP.
run keygen 0 pkg keygen "$TMP/publisher.pem"
SIGNER="$(sed -n 's/^signer: //p' "$TMP/keygen.out")"
[ -n "$SIGNER" ] || die "keygen printed no signer"
run keygen-twice 2 pkg keygen "$TMP/publisher.pem"
has keygen-twice 'written once' "a key is not overwritten"
ok "pkg keygen mints an Ed25519 key once and prints its signer id"

REPO_DIR="$TMP/repo"
run publish-dry 0 publish --key "$TMP/publisher.pem" --to "$REPO_DIR" "$DIR/platform/service"
has publish-dry 'verdict: dry-run' "a publish is a dry run without --yes"
has publish-dry "signer: $SIGNER" "the dry run names the signer"
has publish-dry 'dry run: nothing sent (add --yes)' "the dry run says what it did not do"
[ ! -e "$REPO_DIR/pkg" ] || die "a dry run wrote into the repository"
ok "publish: a dry run runs every check and writes nothing"

run publish-142 0 publish --yes --key "$TMP/publisher.pem" --to "$REPO_DIR" "$DIR/platform/service"
has publish-142 'verdict: sent' "1.4.2 published"
for f in 1.4.2.zip 1.4.2.manifest 1.4.2.sig list; do
  [ -f "$REPO_DIR/pkg/corp.example/schemas/service/@v/$f" ] || die "repository lacks $f"
done
[ -f "$REPO_DIR/advisory/corp.example/schemas/service.aontu" ] || die "no advisory"
ok "publish --to writes the read-path layout: archive, manifest, proof, list, latest, advisory"

run publish-143 0 publish --yes --key "$TMP/publisher.pem" --to "$REPO_DIR" "$DIR/platform/service-next-compat"
has publish-143 'verdict: sent' "1.4.3 published"
has publish-143 "against: $PKG 1.4.2" "the gate ran against the repository's newest"
ok "publish gates against the newest version the repository holds"

run publish-150 1 publish --yes --key "$TMP/publisher.pem" --to "$REPO_DIR" "$DIR/platform/service-next-breaking"
has publish-150 'verdict: breaking' "the breaking release is refused"
[ ! -e "$REPO_DIR/pkg/corp.example/schemas/service/@v/1.5.0.manifest" ] || die "a refused publish wrote"
ok "publish refuses a breaking release and writes nothing"

run publish-again 1 publish --yes --key "$TMP/publisher.pem" --to "$REPO_DIR" "$DIR/platform/service-next-compat"
has publish-again 'refused: version_exists' "a version is never reusable"
ok "publish refuses a version that was published before"

# Serve it. The port is chosen by the OS; the verb prints where.
PORT_FILE="$TMP/serve.out"
$AONTU pkg serve --listen 127.0.0.1:0 "$REPO_DIR" > "$PORT_FILE" 2>&1 &
SERVE_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  grep -q '^serving ' "$PORT_FILE" 2>/dev/null && break
  sleep 0.25
done
BASE="$(sed -n 's/^serving .* at //p' "$PORT_FILE")"
[ -n "$BASE" ] || die "pkg serve did not report an address"
ok "pkg serve serves the repository directory on a loopback address"

# A consumer that names the base and the signer it accepts. A fresh
# cache: this machine has never seen the package.
rm -rf "$XDG_CACHE_HOME"
APP4="$TMP/app4"
mkdir -p "$APP4"
cp "$DIR/consumer/main.aontu" "$APP4/"
{
  cat "$DIR/consumer/pkg.aontu"
  printf 'repo: { base: ["%s"], trust: { "corp.example/*": { signer: "%s", inclusion: none } } }\n' \
    "$BASE" "$SIGNER"
} > "$APP4/pkg.aontu"

run sync-net 0 sync "$APP4"
has sync-net "fetched: $PKG 1.4.2" "the declared version is fetched"
grep -q '"manifest":"sha256:' "$APP4/aontu_meta/pkg-lock.aontu" \
  || die "an acquired package carries no manifest pin"
[ -f "$APP4/$VENDORED/aontu_meta/manifest.aontu" ] || die "the vendored tree keeps no manifest"
[ -f "$APP4/$VENDORED/aontu_meta/proof.aontu" ] || die "the vendored tree keeps no proof"
run eval-net 0 "$APP4/main.aontu"
cmp -s "$TMP/eval1.out" "$TMP/eval-net.out" \
  || die "the acquired package evaluates differently from the hand-vendored one"
ok "sync acquires from the served repository: proof, bytes and meaning checked; three pins locked; manifest and proof kept"

run sync-net-again 0 sync "$APP4"
hasnt sync-net-again 'fetched:' "a second sync fetches nothing"
run frozen-net 0 sync --frozen "$APP4"
ok "sync is idempotent, and --frozen holds"

run why 0 why "$PKG" "$APP4"
has why "corp.example/checkout -> $PKG" "why draws the chain"
ok "why answers with the chain of dependencies from the project"

run outdated 0 pkg outdated "$APP4"
has outdated "$PKG 1.4.2: current" "1.4.3 is inside the cooldown"
has outdated 'cooldown_pending:' "the cooldown is reported, not silently applied"
ok "pkg outdated honours the cooldown: a version published minutes ago is not selectable"

run get-143 0 get "$PKG@1.4.3" "$APP4"
has get-143 "change: raised $PKG 1.4.2 -> 1.4.3" "get raises the minimum"
has get-143 "fetched: $PKG 1.4.3" "and fetches it"
grep -q '"1.4.3"' "$APP4/pkg.aontu" || die "get did not edit pkg.aontu"
ok "get <pkg>@<version> raises the declared minimum and syncs; an explicit version skips the cooldown"

run get-cooldown 1 get "$PKG" "$APP4"
has get-cooldown 'refused: cooldown_pending' "the newest is held back"
ok "get without a version refuses inside the cooldown and names when it lifts"

run add-existing 2 add "$PKG" "$APP4"
has add-existing 'already a dependency' "add refuses what is declared"
ok "add refuses a package already declared and names get"

run remove 0 remove "$PKG" "$APP4"
has remove "change: removed $PKG" "remove drops the dependency"
[ ! -e "$APP4/$VENDORED" ] || die "remove left the vendor tree"
ok "remove drops the dependency, its lock entry and its vendor tree"

# The wrong signer is refused before a byte of the archive is read.
APP5="$TMP/app5"
mkdir -p "$APP5"
cp "$DIR/consumer/main.aontu" "$APP5/"
{
  cat "$DIR/consumer/pkg.aontu"
  printf 'repo: { base: ["%s"], trust: { "corp.example/*": { signer: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", inclusion: none } } }\n' \
    "$BASE"
} > "$APP5/pkg.aontu"
rm -rf "$XDG_CACHE_HOME"
run sync-untrusted 1 sync "$APP5"
has sync-untrusted 'refused: proof_signer_untrusted' "a signer the project does not trust"
[ ! -e "$APP5/aontu_meta/vendor" ] || die "an untrusted package was vendored"
ok "sync refuses a proof by a signer the project does not accept; nothing is written"

# A tampered archive on the wire: the digest is checked before parsing.
cp "$REPO_DIR/pkg/corp.example/schemas/service/@v/1.4.2.zip" "$TMP/1.4.2.zip.orig"
printf 'x' >> "$REPO_DIR/pkg/corp.example/schemas/service/@v/1.4.2.zip"
APP6="$TMP/app6"
mkdir -p "$APP6"
cp "$APP4/main.aontu" "$APP6/"
{
  cat "$DIR/consumer/pkg.aontu"
  printf 'repo: { base: ["%s"], trust: { "corp.example/*": { signer: "%s", inclusion: none } } }\n' \
    "$BASE" "$SIGNER"
} > "$APP6/pkg.aontu"
rm -rf "$XDG_CACHE_HOME"
run sync-tampered 1 sync "$APP6"
has sync-tampered 'refused: archive_digest_mismatch' "the archive is refused on its bytes"
cp "$TMP/1.4.2.zip.orig" "$REPO_DIR/pkg/corp.example/schemas/service/@v/1.4.2.zip"
ok "sync refuses an archive whose digest is not the manifest's, before parsing it"

# A move: the old path's last version names the new one, and nothing
# follows it.
MOVED="$TMP/service-moved"
cp -r "$DIR/platform/service-next-compat" "$MOVED"
sed -i 's/version:"1.4.3"/version:"1.4.4"/' "$MOVED/pkg.aontu"
printf 'moved: "corp.example/schemas/service2"\n' >> "$MOVED/pkg.aontu"
run publish-moved 0 publish --yes --key "$TMP/publisher.pem" --to "$REPO_DIR" "$MOVED"
has publish-moved 'moved: corp.example/schemas/service2' "the manifest carries the move"
rm -rf "$XDG_CACHE_HOME"
run sync-moved 1 sync "$APP6"
has sync-moved 'refused: module_moved' "a moved package refuses"
has sync-moved 'moved to corp.example/schemas/service2; import that instead' "and names the destination"
run publish-frozen 1 publish --yes --key "$TMP/publisher.pem" --to "$REPO_DIR" "$DIR/platform/service-next-breaking"
has publish-frozen 'refused: path_moved' "the old path is frozen"
ok "moved: the old path refuses every acquisition, names the destination, and accepts no further publish"

kill "$SERVE_PID" 2>/dev/null || true
SERVE_PID=""

# --------------------------- H. vetting agent candidates via the module
run vet-good 0 vet --at spec "$APP/gate.aontu" "$DIR/data/checkout-good.json"
has vet-good 'verdict: valid' "good candidate"
ok "vet: agent-emitted candidate valid against the vendored platform truth"

run vet-bad 1 vet --at spec "$APP/gate.aontu" "$DIR/data/rogue-sidecar.json"
has vet-bad 'verdict: invalid' "bad candidate refused"
has vet-bad 'aontu/constraint' "regex constraints fire"
has vet-bad 'aontu/closed' "close() catches the rogue sidecar key"
ok "vet: rogue candidate refused -- name/owner constraints and closed() violations"

# ------------------------------- I. transitive dependencies
# The flat layout `sync` writes is the layout a nested import reads:
# resolution tries every enclosing pkg.aontu root, not just the nearest
# one, so a dependency vendored beside its dependant is found.
TAPP="$TMP/tapp"
mkdir -p "$TAPP/aontu_meta/vendor/corp.example/schemas"
cp "$DIR/probes/transitive/app/pkg.aontu" "$DIR/probes/transitive/app/main.aontu" "$TAPP/"
cp -r "$DIR/probes/transitive/service-dep" "$TAPP/aontu_meta/vendor/corp.example/schemas/service"
cp -r "$DIR/probes/transitive/common" "$TAPP/aontu_meta/vendor/corp.example/schemas/common"

run sync-trans 0 sync "$TAPP"
has sync-trans 'corp.example/schemas/common 1.2.0' \
  "MVS selects the highest minimum (1.2.0 over 1.0.0)"
ok "MVS: common selected at 1.2.0, the highest of the declared minima"

FLATPIN="$(grep -o '"corp.example/schemas/service":{"archive":"sha256:[0-9a-f]*","canon":"aon1-[A-Za-z0-9_-]*' \
  "$TAPP/aontu_meta/pkg-lock.aontu" | grep -o 'aon1-[A-Za-z0-9_-]*$')"

run eval-trans 0 "$TAPP/main.aontu"
ok "flat-vendored transitive dep evaluates: common found beside service"

run why-trans 0 why corp.example/schemas/common "$TAPP"
has why-trans 'corp.example/checkout -> corp.example/schemas/common' "the direct chain"
has why-trans 'corp.example/checkout -> corp.example/schemas/service -> corp.example/schemas/common' \
  "and the chain through service"
ok "why lists every chain that reaches a package"

# The pin sync locked is a real pin: `aontu hash` -- which refuses any
# file that does not evaluate on its own -- agrees with it exactly.
run hash-trans 0 hash "$TAPP/aontu_meta/vendor/corp.example/schemas/service/service.aontu"
[ "$(cat "$TMP/hash-trans.out")" = "$FLATPIN" ] \
  || die "aontu hash of the dep-bearing module differs from its locked pin"
ok "sync's pin for the dep-bearing module equals what aontu hash computes"

# A module that cannot evaluate is not pinned at all: tidy refuses it
# rather than locking canonHash(nil), which every broken module shares.
BAPP="$TMP/bapp"
mkdir -p "$BAPP/aontu_meta/vendor/corp.example/schemas"
cp "$DIR/probes/transitive/app/pkg.aontu" "$DIR/probes/transitive/app/main.aontu" "$BAPP/"
cp -r "$DIR/probes/transitive/service-dep" "$BAPP/aontu_meta/vendor/corp.example/schemas/service"
run tidy-unevaluable 4 pkg tidy "$BAPP"
has tidy-unevaluable 'verdict: error' "unevaluable module is an error"
has tidy-unevaluable 'corp.example/schemas/service: does not evaluate on its own; nothing to pin' \
  "refusal names the module and the reason"
[ ! -e "$BAPP/aontu_meta/pkg-lock.aontu" ] || die "tidy must not write a lockfile it cannot fill"
ok "tidy refuses to pin a module it cannot evaluate (no canonHash(nil) pin)"

# Internal absolute refs: fine standalone, broken at a nested key.
RAPP="$TMP/rapp"
mkdir -p "$RAPP/aontu_meta/vendor/corp.example/schemas/service"
cp "$DIR/platform/service/pkg.aontu" "$RAPP/aontu_meta/vendor/corp.example/schemas/service/"
cp "$DIR/probes/nested-ref/service.aontu" "$RAPP/aontu_meta/vendor/corp.example/schemas/service/"
cp "$DIR/probes/transitive/app/main.aontu" "$RAPP/"
run hash-ref 0 hash "$RAPP/aontu_meta/vendor/corp.example/schemas/service/service.aontu"
run eval-ref 1 "$RAPP/main.aontu"
has eval-ref 'aontu/no_path' "internal ref breaks under nested import"
ok "gap reproduced: module-internal \$.ref evaluates standalone, no_path when nested"

# ------------------------- J. version bookkeeping is not cross-checked
APP7="$TMP/app7"
mkdir -p "$APP7/aontu_meta/vendor/corp.example/schemas"
cp "$DIR/consumer/main.aontu" "$APP7/"
sed 's/"1.4.2"/"9.9.9"/' "$DIR/consumer/pkg.aontu" > "$APP7/pkg.aontu"
cp -r "$DIR/platform/service" "$APP7/$VENDORED"
run sync-vfake 1 sync "$APP7"
has sync-vfake 'refused: fetch_failed' "a declared version the vendor tree does not hold is fetched"
ok "a vendored tree at another version is not taken as the declared one: sync reaches for the repository"


# THE MODEL TREE. The shape of this document, drawn by the one kind
# that reads no report: `view doc` walks the anchor, exactly as
# `model get --keys --types` does, and stops at a depth that says how
# many keys it did not draw. The figure at the head of the README is
# this, and `--check` is the gate that keeps it true.
# The figure is what goes to STDOUT; the loss report goes to stderr,
# and merging the two would compare the golden against both.
$AONTU view doc --depth 3 "$DIR/consumer/main.aontu" > "$TMP/doc.out" 2>/dev/null \
  || die "the model tree did not draw"
diff -u "$DIR/expected/diagram-doc.txt" "$TMP/doc.out" \
  || die "the model tree drifted"
run docgate 0 view doc --depth 3 \
  --out "$DIR/expected/diagram-doc.txt" --check "$DIR/consumer/main.aontu"
run docsvg 0 view doc --depth 3 --as svg \
  --out "$DIR/expected/diagram-doc.svg" --check "$DIR/consumer/main.aontu"
ok "the model tree draws and is pinned, text and SVG"
echo
echo "all $PASS checks passed"
