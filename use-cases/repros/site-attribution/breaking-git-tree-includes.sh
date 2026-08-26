#!/bin/sh
# Claim C2 (CRITICAL): `breaking --against git#rev` takes only the
# ENTRY file's text from git (`git show <rev>:./<basename>`,
# ts/src/cli.ts againstSource); the old side's @"..." includes resolve
# from the WORKING TREE (cli.ts runBreaking: "A git#rev source has no
# directory of its own; its relative loads resolve as the working
# file's do"). So the old side is old-entry + NEW includes, and a
# breaking change made INSIDE an included file compares new-vs-new.
# docs/how-to.md recommends exactly this spelling as a CI gate
# ("aontu breaking --against git#origin/main service.aon").
# expected: verdict: breaking, exit 1 (port narrowed *8080|integer -> 8080
#           in the included schema.aon; a v1 doc with port 9090 is now
#           refused -- `--against <path to old copy>` DOES report it)
# actual:   verdict: compatible, exit 0
set -e
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"   # the repo root
AONTU="${AONTU:-node $ROOT/ts/bin/aontu.js}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cd "$T" && git init -q . && git config user.email r@r && git config user.name r

printf 'port: *8080 | integer\n' > schema.aon
printf 'svc: @"schema.aon"\n'    > entry.aon
git add -A && git commit -qm v1

# The breaking change lives in the INCLUDED file only.
printf 'port: 8080\n' > schema.aon

echo "--- git spelling (unsound: old includes read from the tree) ---"
$AONTU breaking --against 'git#HEAD' entry.aon && echo "exit=0" || echo "exit=$?"

echo "--- control: same state, old version given as a tree copy ---"
mkdir old && git show HEAD:./entry.aon > old/entry.aon \
          && git show HEAD:./schema.aon > old/schema.aon
$AONTU breaking --against old/entry.aon entry.aon || echo "exit=$? (breaking, as it should be)"
