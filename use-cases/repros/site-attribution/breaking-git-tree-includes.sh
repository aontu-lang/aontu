#!/bin/sh
# Claim C2 (CRITICAL) -- FIXED 2026-08-26.
#
# `breaking --against git#rev` used to take only the ENTRY file's text
# from git (`git show <rev>:./<basename>`), so the old side's @"..."
# includes resolved from the WORKING TREE: the old side was old-entry
# text meeting NEW includes, and a breaking change made INSIDE an
# included file compared new-vs-new and answered `compatible`.
# docs/how-to.md recommends exactly this spelling as a CI gate.
#
# The git spelling now materialises the old TREE's includable sources
# into a temporary directory and evaluates the old document from there
# (ts/src/cli.ts oldVersion, go/cmd/aontu/subsume.go resolveAgainst).
#
# expected: verdict: breaking, exit 1 (port narrowed *8080|integer ->
#           8080 in the included schema.aon; a v1 doc with port 9090 is
#           now refused)
# actual:   verdict: breaking, exit 1  -- as expected since the fix
# pinned by: ts/test/cli.test.ts breaking-git-compares-the-old-tree,
#           go/cmd/aontu/subsume_test.go TestBreakingGitComparesTheOldTree
#           (both assert the unchanged-tree control stays compatible,
#           so a fix that merely reported breaking would fail)
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
