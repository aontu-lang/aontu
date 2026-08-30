#!/usr/bin/env bash
# Schema-evolution governance for a shared customer-profile schema:
# v1 -> v2 (additive + deprecation) -> v3 (major).  Drives the real
# aontu CLI end to end and asserts every outcome (exit codes, error
# codes, JSON goldens).  See README.md for the findings.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
AONTU="${AONTU:-node $REPO/ts/bin/aontu.js}"
MCP="${MCP:-node $REPO/ts/bin/aontu-mcp.js}"

# Run from the use-case directory so the reports carry relative file
# sites and the goldens stay machine-independent.
cd "$DIR"

TMP="$(mktemp -d)"
trap 'cd /; rm -rf "$TMP"' EXIT

step=0
say() { step=$((step+1)); printf '\n[%02d] %s\n' "$step" "$*"; }

# run <want-exit> <outfile> <cmd...>  -- assert the exit code.
run() {
  local want="$1" out="$2"; shift 2
  local got=0
  set +e; "$@" >"$out" 2>&1; got=$?; set -e
  if [ "$got" -ne "$want" ]; then
    echo "FAIL: expected exit $want, got $got: $*"; cat "$out"; exit 1
  fi
}

# has <fixed-string> <file> / lacks <fixed-string> <file>
has()   { grep -qF -- "$1" "$2" || { echo "FAIL: '$1' missing from $2"; cat "$2"; exit 1; }; }
lacks() { ! grep -qF -- "$1" "$2" || { echo "FAIL: '$1' unexpectedly present in $2"; cat "$2"; exit 1; }; }

# golden <got-file> <expected-file>
golden() { diff -u "$2" "$1" || { echo "FAIL: $1 does not match golden $2"; exit 1; }; }

# normalise a report: drop the CLI version so goldens survive releases
norm() { node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));if(o.aontu)delete o.aontu.version;console.log(JSON.stringify(o,null,2))'; }

# ---------------------------------------------------------------- sanity
say "all three released versions render canonically"
run 0 "$TMP/c1" $AONTU --canon profile-v1.aon
run 0 "$TMP/c2" $AONTU --canon profile-v2.aon
run 0 "$TMP/c3" $AONTU --canon profile-v3.aon
golden "$TMP/c2" expected/profile-v2.canon

# ------------------------------------------------------------------ vet
say "vet: a conforming v2 instance is valid (exit 0)"
run 0 "$TMP/vet-ok" $AONTU vet --at '$.profile' profile-v2.aon data/customer-ok.json
has "verdict: valid" "$TMP/vet-ok"
# Documented friction: the deprecated warning fires although this
# instance never uses phone (the site role is schema:, not data:).
has "deprecated" "$TMP/vet-ok"
has "schema: profile-v2.aon" "$TMP/vet-ok"

say "vet: a legacy instance still using phone is valid, with the deprecation surfaced at its data site"
run 0 "$TMP/vet-legacy" $AONTU vet --format json --at '$.profile' profile-v2.aon data/customer-legacy-phone.json
norm < "$TMP/vet-legacy" > "$TMP/vet-legacy.norm"
golden "$TMP/vet-legacy.norm" expected/vet-legacy-phone.json

say "vet: the same legacy instance against v1 carries no deprecation warning"
run 0 "$TMP/vet-legacy-v1" $AONTU vet --at '$.profile' profile-v1.aon data/customer-legacy-phone.json
has "verdict: valid" "$TMP/vet-legacy-v1"
lacks "deprecated" "$TMP/vet-legacy-v1"

say "vet: a malformed email is invalid (exit 1, [aontu/constraint])"
run 1 "$TMP/vet-bad" $AONTU vet --at '$.profile' profile-v2.aon data/customer-bad-email.json
has "[aontu/constraint]" "$TMP/vet-bad"
has "verdict: invalid" "$TMP/vet-bad"

say "vet: an undeclared key is refused by the closed map (exit 1, [aontu/closed])"
run 1 "$TMP/vet-closed" $AONTU vet --at '$.profile' profile-v2.aon data/customer-unknown-field.json
has "[aontu/closed]" "$TMP/vet-closed"

say "vet: a missing required literal-enum key (tier) is incomplete (exit 3)"
# GAP CLOSED 2026-08-27 (ADR-007). tier is
# 'standard'|'premium'|'enterprise' with no default and the instance
# omits it. The verdict used to be valid / exit 0: generation FOLDED
# the alternatives together, and the resulting scalar CONFLICT was
# filtered out by vet's incomplete-class pass. It is now
# `disjunct_no_gen`, class incomplete -- the same answer the regex-enum
# workaround below has always given, so the workaround is no longer
# needed to make presence enforceable.  README, gap 2.
run 3 "$TMP/vet-notier" $AONTU vet --at '$.profile' profile-v2.aon data/customer-missing-tier.json
has "verdict: incomplete" "$TMP/vet-notier"
has "disjunct_no_gen" "$TMP/vet-notier"

say "vet: the regex-enum workaround (v3 region) does report the omission (exit 3, incomplete)"
run 3 "$TMP/vet-noregion" $AONTU vet --at '$.profile' profile-v3.aon data/customer-ok.json
has "verdict: incomplete" "$TMP/vet-noregion"
has "mapval_required" "$TMP/vet-noregion"
has '$.profile.region' "$TMP/vet-noregion"

# -------------------------------------------------------------- subsume
say "subsume: v2 admits every v1 instance (backward direction, exit 0)"
run 0 "$TMP/sub-b" $AONTU subsume profile-v2.aon profile-v1.aon
has "verdict: subsumes" "$TMP/sub-b"

say "subsume: v1 does not admit v2 (closed maps make additions forward-incompatible)"
run 1 "$TMP/sub-f" $AONTU subsume profile-v1.aon profile-v2.aon
has "compat_narrowed" "$TMP/sub-f"
has '$.profile.contact' "$TMP/sub-f"
has '$.profile.locale' "$TMP/sub-f"

# ---------------------------------------------------- the breaking gate
say "breaking: v2 against v1 is compatible (additive + deprecate, exit 0)"
run 0 "$TMP/brk-v2" $AONTU breaking --against profile-v1.aon profile-v2.aon
has "verdict: compatible" "$TMP/brk-v2"

say "breaking: narrowing the email pattern is refused (exit 1, compat_narrowed)"
run 1 "$TMP/brk-narrow" $AONTU breaking --against profile-v2.aon proposals/narrow-email.aon
has "compat_narrowed" "$TMP/brk-narrow"
has '$.profile.email' "$TMP/brk-narrow"

say "breaking: adding a required key is refused (exit 1, compat_required_added)"
run 1 "$TMP/brk-req" $AONTU breaking --against profile-v2.aon proposals/require-loyalty.aon
has "compat_required_added" "$TMP/brk-req"
has '$.profile.loyalty' "$TMP/brk-req"

say "breaking: v3 against v2 is breaking; the JSON report matches the golden"
run 1 "$TMP/brk-v3" $AONTU breaking --format json --against profile-v2.aon profile-v3.aon
norm < "$TMP/brk-v3" > "$TMP/brk-v3.norm"
golden "$TMP/brk-v3.norm" expected/breaking-v3-report.json

say "breaking: --allow-deprecated-removal does NOT excuse the required region key (still exit 1)"
run 1 "$TMP/brk-v3-adr" $AONTU breaking --against profile-v2.aon --allow-deprecated-removal profile-v3.aon
has "compat_required_added" "$TMP/brk-v3-adr"

say "breaking: removing the deprecated phone alone fails plain (exit 1) ..."
run 1 "$TMP/brk-rm" $AONTU breaking --against profile-v2.aon proposals/v3-remove-phone.aon
has "compat_narrowed" "$TMP/brk-rm"
has '$.profile.phone' "$TMP/brk-rm"

say "breaking: ... and passes with --allow-deprecated-removal (exit 0, finding kept as a warning)"
run 0 "$TMP/brk-rm-ok" $AONTU breaking --format json --against profile-v2.aon --allow-deprecated-removal proposals/v3-remove-phone.aon
has '"verdict": "compatible"' "$TMP/brk-rm-ok"
has '"severity": "warning"' "$TMP/brk-rm-ok"
has '"code": "compat_narrowed"' "$TMP/brk-rm-ok"

# ------------------------------------------------------------- profiles
say "profiles: flipping the marketing default -- values says compatible, defaults says compat_default_changed"
run 0 "$TMP/prof-v" $AONTU subsume --profile values proposals/default-change.aon profile-v2.aon
has "verdict: subsumes" "$TMP/prof-v"
run 1 "$TMP/prof-d" $AONTU subsume --format json --profile defaults proposals/default-change.aon profile-v2.aon
norm < "$TMP/prof-d" > "$TMP/prof-d.norm"
golden "$TMP/prof-d.norm" expected/subsume-default-change.json

say "profiles: hiding a generated field is caught only by --profile gen (compat_marks_changed)"
run 0 "$TMP/marks-v" $AONTU subsume --profile values probes/hide-score-v2.aon probes/hide-score-v1.aon
run 0 "$TMP/marks-d" $AONTU subsume --profile defaults probes/hide-score-v2.aon probes/hide-score-v1.aon
run 1 "$TMP/marks-g" $AONTU subsume --profile gen probes/hide-score-v2.aon probes/hide-score-v1.aon
has "compat_marks_changed" "$TMP/marks-g"

say "profiles: under gen, v2 subsumes ITSELF (gap closed 2026-08-27)"
# The documented aontu_policy idiom (hide + *pref|...) used to make
# gen-profile self-comparison undecided. README, gap 5. Two causes,
# both closed: a pref MEMBER was compared by its kind superior (the
# pre-ADR-004 reading, which the walk kept after the engine stopped
# using it), and the gen profile's mark rule fired inside a
# DISTRIBUTION TRIAL, comparing a whole marked disjunction against a
# member extracted out of one.
run 0 "$TMP/gen-self" $AONTU subsume --profile gen profile-v2.aon profile-v2.aon
has "verdict: subsumes" "$TMP/gen-self"

# ------------------------------------------------------ undecided cases
say "undecided: a Band-B must() on the new side stops the gate (exit 3, sub_evaluate_only)"
run 3 "$TMP/und-must" $AONTU breaking --against profile-v2.aon probes/must-email-domain.aon
has "verdict: undecided" "$TMP/und-must"
has "sub_evaluate_only" "$TMP/und-must"

say "undecided: --allow-undecided turns that into an explicit human override (exit 0, still reported)"
run 0 "$TMP/und-allow" $AONTU breaking --against profile-v2.aon --allow-undecided probes/must-email-domain.aon
has "sub_evaluate_only" "$TMP/und-allow"

say "undecided: a key()-dependent spread template cannot be compared (exit 3, sub_path_dependent_spread)"
run 3 "$TMP/und-key" $AONTU subsume probes/routing-v2.aon probes/routing-v1.aon
has "sub_path_dependent_spread" "$TMP/und-key"

# ------------------------------------------------- the policy loophole
say "policy: DOCUMENTED GAP -- a PR that pins compat:none waives its own gate (exit 0 on a breaking change)"
run 0 "$TMP/waive" $AONTU breaking --against profile-v2.aon proposals/waive-gate.aon
has "verdict: compatible" "$TMP/waive"

say "policy: CI pinning --mode backward closes the loophole (exit 1)"
run 1 "$TMP/waive-mode" $AONTU breaking --against profile-v2.aon --mode backward proposals/waive-gate.aon
has "compat_required_added" "$TMP/waive-mode"

# ------------------------------------------- version metadata friction
say "metadata: DOCUMENTED GAP -- an in-document version string self-breaks on every bump"
run 1 "$TMP/meta" $AONTU breaking --against probes/meta-v1.aon probes/meta-v2.aon
has '$.meta.version' "$TMP/meta"
has "compat_narrowed" "$TMP/meta"

say "metadata: breaking --at skips it (gap closed 2026-08-27)"
# `breaking` now takes subsume's own anchor, so the version bump above
# stops deciding the verdict and the contract is compared on its own.
# The manual subsume --at workaround still answers the same way.
run 0 "$TMP/meta-at" $AONTU breaking --against probes/meta-v1.aon --at '$.profile' probes/meta-v2.aon
has "verdict: compatible" "$TMP/meta-at"
run 0 "$TMP/meta-sub" $AONTU subsume --at '$.profile' probes/meta-v2.aon probes/meta-v1.aon
has "verdict: subsumes" "$TMP/meta-sub"

# ----------------------------------------------------------------- hash
say "hash: reformatting (key order, comments, whitespace) keeps the pin"
run 0 "$TMP/h2" $AONTU hash profile-v2.aon
run 0 "$TMP/h2r" $AONTU hash probes/v2-reformatted.aon
diff "$TMP/h2" "$TMP/h2r" || { echo "FAIL: reformatting moved the hash"; exit 1; }

say "hash: a semantic change moves the pin"
run 0 "$TMP/h3" $AONTU hash profile-v3.aon
if diff -q "$TMP/h2" "$TMP/h3" >/dev/null; then echo "FAIL: v2 and v3 hash alike"; exit 1; fi

say "hash: --form carries the marks (close/hide/deprecate) that --canon omits"
run 0 "$TMP/hf" $AONTU hash --form profile-v2.aon
has 'deprecate(string' "$TMP/hf"
has 'close({' "$TMP/hf"
lacks 'close({' "$TMP/c2"   # the --canon output from step 1

# -------------------------------------------------- diff (MCP-only today)
say "diff: not a CLI verb (usage, exit 2); the MCP server's diff tool answers instead"
run 2 "$TMP/diff-cli" $AONTU diff profile-v2.aon profile-v3.aon
has "mistyped verb" "$TMP/diff-cli"
node -e '
const fs = require("fs");
const l = fs.readFileSync("profile-v2.aon", "utf8");
const r = fs.readFileSync("profile-v3.aon", "utf8");
const init = {jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"check",version:"0"}}};
const call = {jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"diff",arguments:{left:l,right:r}}};
process.stdout.write(JSON.stringify(init)+"\n"+JSON.stringify(call)+"\n");
' > "$TMP/mcp-req"
$MCP < "$TMP/mcp-req" 2>/dev/null | tail -1 \
  | node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(o.result.content[0].text)' \
  > "$TMP/diff-mcp"
golden "$TMP/diff-mcp" expected/diff-v2-v3.json

# --------------------------------------------------------- git#rev gate
say "git: the CI form gates a working file against its committed ancestor (git#HEAD)"
if command -v git >/dev/null 2>&1; then
  gitdir="$TMP/repo"
  git init -q "$gitdir"
  cp profile-v1.aon "$gitdir/profile.aon"
  git -C "$gitdir" -c user.email=ci@example.com -c user.name=CI add profile.aon
  git -C "$gitdir" -c user.email=ci@example.com -c user.name=CI commit -qm "profile v1"
  cp profile-v2.aon "$gitdir/profile.aon"
  ( cd "$gitdir" && run 0 "$TMP/git-ok" $AONTU breaking --against 'git#HEAD' profile.aon )
  has "verdict: compatible" "$TMP/git-ok"
  cp proposals/narrow-email.aon "$gitdir/profile.aon"
  ( cd "$gitdir" && run 1 "$TMP/git-bad" $AONTU breaking --against 'git#HEAD' profile.aon )
  has "compat_narrowed" "$TMP/git-bad"
else
  # The git#HEAD gate is part of this case's contract; a run that
  # cannot exercise it must not report success.
  echo "FAIL - git is required (the git#rev gate cannot be skipped)" >&2
  exit 1
fi

say "the release history, drawn as a subsumption poset"
# Not a chain. `subsume` decides each pair; the renderer quotients by
# MUTUAL subsumption (two documents that subsume each other are one
# node -- the hash is a sufficient identity and never a necessary one),
# then draws the cover relation. Seven documents, six nodes: v2 is a
# true generalisation of v1, v3 is comparable with nothing, and two
# independently written proposals turn out to make the identical schema
# change. There is no `aontu order` verb yet; see
# docs/design/VIEWS-ORDER.0.md.
"${NODE:-node}" "$DIR/../tools/diagram.js" poset --at '$.profile' \
  "$DIR/profile-v1.aon" "$DIR/profile-v2.aon" "$DIR/profile-v3.aon" \
  "$DIR/proposals/narrow-email.aon" "$DIR/proposals/require-loyalty.aon" \
  "$DIR/proposals/v3-remove-phone.aon" "$DIR/proposals/waive-gate.aon" \
  > "$TMP/diagram-poset.mmd" \
  || { echo "FAIL: poset diagram did not render"; exit 1; }
golden "$TMP/diagram-poset.mmd" "$DIR/expected/diagram-poset.mmd"

printf '\nAll %d steps passed.\n' "$step"
