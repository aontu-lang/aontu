# How to release and tag

aontu ships **two artifacts from one repository**, and they release by
different mechanisms:

| artifact | source of the version | released by | tag |
| --- | --- | --- | --- |
| npm `aontu` | `ts/package.json` `"version"` | publishing to the registry | `v<version>` |
| Go `github.com/aontu-lang/aontu/go` | `go/aontu.go` `const VERSION` | **the tag itself** | `go/v<version>` |

That second row is the one that surprises people. A Go module has no
registry upload step: `proxy.golang.org` serves whatever a tag points at, so
**pushing the tag *is* the release**. There is nothing else to do, and
nothing to undo it.

This page blends how-to and explanation on purpose, under the exception
[STYLE-GUIDE.md](STYLE-GUIDE.md) makes for it: a release is irreversible
enough that the rationale stays beside the commands.

> **This path is proven.** Its first end-to-end run was 2026-08-28:
> one dispatch from `main` at `2cec558` published npm `aontu@0.53.0`
> over OIDC and pushed both `v0.53.0` and `go/v0.1.11`. The trusted
> publisher registration on npmjs.com does name `aontu-lang/aontu` and
> `publish.yml` — that was the open question after the repository move,
> and the green run answers it.

## The normal path

```
make publish V=0.54.0 GOV=0.1.12   # release both
make publish V=0.54.0              # npm only
make publish GOV=0.1.12            # Go module only
```

Bumps whichever versions you give — `V` for `ts/package.json`, `GOV` for
`go/aontu.go` — runs `make all` (both builds, both suites), commits, pushes
`main`, and dispatches the publish workflow with matching inputs, which
publishes to npm and writes `v<V>` and `go/v<GOV>`.

**Two numbers, not one, deliberately** — see [One version series each](#one-version-series-each).

Every guard runs **before** anything is written, because half of this is
irreversible: npm never allows republishing a version, and
`proxy.golang.org` caches a Go module version immutably. It refuses unless
you are on `main`, with a clean tree, not behind `origin/main`, with neither
tag already taken (asked of **origin**, since the clone's tag list can be
stale), and with the Go module path matching the major version.

### Or drive the workflow directly

**Actions → publish → Run workflow**, on `main`, leaving `go` ticked unless
only the npm package changed. That single run publishes to npm and pushes
both tags.

The equivalent from a shell:

```
gh workflow run publish.yml --ref main -f go=true
```

**There is no version input, deliberately.** The dispatch releases whatever
the ref already says, so bump the versions **first**, in a normal reviewed
PR:

```
# ts/package.json  "version": "0.54.0"
# go/aontu.go      const VERSION = "0.1.12"
```

A version input would let the dispatch and the files disagree — you would
tag `v0.54.0` on a package that says `0.53.0`. Reading from the files makes
that impossible by construction, and keeps the bump a diff someone approved
while the release stays a button.

Release only the half that changed. A TypeScript-only change wants
`go=false`; leaving it ticked with an unchanged `VERSION` is harmless — the
workflow refuses rather than moving an existing tag.

## The trusted-publisher registration

The repository moved from `rjrodger/aontu` to `aontu-lang/aontu`, and **an
npm trusted publisher is bound to owner, repo, and workflow filename**. The
entry on npmjs.com must name `aontu-lang/aontu` and `publish.yml`, or the
OIDC exchange is refused — reported, unhelpfully, as a 404 (see below).
**The 0.53.0 release on 2026-08-28 published over OIDC, so the entry is
correct today.** It is recorded here because it breaks silently: an org
rename or a renamed workflow file voids it, and the failure lands after
the version bump is already pushed.

npmjs.com → the `aontu` package → Settings → Trusted Publisher → GitHub
Actions:

```
Organization or user:  aontu-lang
Repository:            aontu
Workflow filename:     publish.yml
Environment:           (blank — this workflow declares none)
```

## One version series each

npm and the Go module are versioned independently — npm is on 0.5x, the Go
module on 0.x — and sharing a number is not as simple as it sounds, because
**from v2 on, Go requires the major version in the module path.**

```
module github.com/aontu-lang/aontu/go      # ok for v0.x and v1.x
module github.com/aontu-lang/aontu/go/v2   # required from v2.x
```

Tagging `go/v2.0.0` while `go.mod` still declares the unsuffixed path
produces a version the Go toolchain will not resolve — and the tag cannot be
taken back. `make check-go-major` refuses that combination rather than
letting it reach a tag:

```
$ make check-go-major V=2.0.0
publish: go.mod says 'github.com/aontu-lang/aontu/go' but v2.0.0 is major 2.
         Go requires the major in the module path from v2 on:
           module github.com/aontu-lang/aontu/go/v2
         Every consumer's import path changes with it.
```

Moving the Go module to match npm's series would therefore mean editing
`go/go.mod` **and every consumer's import path**. That is a one-time,
deliberate migration, not something a release command should do on the fly,
so the two series stay separate and `make publish` takes a version for each.

## Why publishing and tagging live in the same file

**npm allows exactly one workflow file per trusted publisher.** The entry
registered on npmjs.com names owner, repo, and a single workflow *filename*.
There is no second slot. The name itself is arbitrary — what matters is that
**only the registered file can publish**. So anything that must accompany a
publish — here, the tags — has to live inside that one file rather than in a
workflow of its own.

An OIDC token from an unregistered workflow is rejected, and npm reports it
as:

```
npm error 404 Not Found - PUT https://registry.npmjs.org/aontu
```

Read literally that says the package does not exist, which is nonsense — npm
answers an unregistered publisher with **404 rather than 403** so as not to
leak whether a package exists. Expect to lose an hour to the wrong
hypothesis unless you know this. The same 404 is what a stale owner/repo
registration produces after a repository move.

Renaming the registered file breaks publishing until the npm-side entry is
updated to match.

### Two credentials, easily conflated

Both are needed, and neither can do the other's job:

| permission | authority | does |
| --- | --- | --- |
| `id-token: write` | OIDC, exchanged for a short-lived credential *at npm* | publishes |
| `contents: write` | the per-run `GITHUB_TOKEN` | writes tags |

OIDC **cannot create a tag** — its audience is the registry, not GitHub.

**They live in separate jobs, and the split is a security boundary.** The
`publish` job runs `npm install`, the build and the tests — dependency
lifecycle scripts and project code — and keeps `contents: read`. The `tag`
job runs git and nothing else, and is the only place `contents: write`
exists. In one job they would share a credential: `checkout` persists its
token into the git config for the whole job, so every dependency
`postinstall` executed during `npm install` would be running alongside a
repository-write credential it has no business having.

And a second reason the two cannot be split across workflows: **a ref pushed
with `GITHUB_TOKEN` does not start another workflow run.** GitHub suppresses
that so workflows cannot trigger themselves. So "tag in workflow A, let the
publisher fire on the `v*` tag" publishes **nothing, silently**.

## What the workflow refuses to do

Guards that fail closed, in the order they run:

1. **A dispatch from any ref but `main`.** `gh workflow run --ref` accepts
   any branch, and the Makefile's guard only binds callers who went through
   `make publish` — so without this the Actions UI could release a feature
   branch, irreversibly.
2. **`main` having moved since the bump**, when `expect_sha` is given (as
   `make publish` does). `--ref main` names a mutable branch: between the
   release commit being pushed and the run resolving, another commit can
   land and be released under the version just bumped.
3. **A tag that already exists *on a different commit*.** Means the version
   was not bumped, and moving it would rewrite a published release. A tag
   already pointing at **this** commit is the idempotent case — nothing to
   create, not an error — which is what makes re-dispatching after a partial
   release safe.
4. **A pushed tag that disagrees with the package version.** On the manual
   `v*` path only: pushing `v0.55.0` while `ts/package.json` still says
   `0.54.0` would resolve 0.54.0, find it already published, skip the
   publish and go green — leaving a tag with no release behind it.
5. **A failing build or test**, in both ports. `build.yml` already runs the
   Go matrix on every push and PR, so `main` is covered; the release re-runs
   it against the exact commit that becomes an immutable module version.

And one guard that fails *open*, on purpose:

6. **A version already on npm** is checked, not assumed. The registry is the
   source of truth for "is this released", not the tag: a run can publish and
   then fail before tagging, leaving a version on npm with nothing pointing
   at it. Without this check that state is unrecoverable — the publish step
   dies on `cannot publish over the previously published versions` before
   reaching the tag steps. Publishing only what is missing, and tagging
   either way, makes a dispatch idempotent and able to reconcile a
   half-finished release.

Skipping a publish assumes "same version means same code", which holds only
if `main` has not moved — so when the version is already present, the run
compares npm's recorded `gitHead` with the commit being released and refuses
a mismatch. An absent `gitHead` warns rather than blocks, because refusing
would make legitimate recovery impossible.

A prerelease (`0.54.0-beta.1`) publishes under the `next` dist-tag, not
`latest`, so it is never handed to an unpinned install.

Publishing happens **before** tagging, so a tag only ever exists for a
release that actually reached the registry. A failed publish writes no tag,
and the dispatch can simply be re-run.

## If something goes wrong

**The run failed at the tag step.** The publish succeeded; only the ref write
did not. Re-dispatch — the registry check skips the completed publish and
retries the tag. If it fails again, a tag protection rule is refusing
`GITHUB_TOKEN`, and that is a repository settings fix, not a workflow one.

**The version is on npm but untagged.** Same remedy: re-dispatch. This is
exactly the case guard 6 exists for.

**A tag was pushed pointing at the wrong commit.** For the Go module, assume
it is permanent. `proxy.golang.org` caches module versions immutably and by
design, so deleting and re-pushing a `go/vX.Y.Z` tag does **not** change what
consumers resolve. Do not try to fix a Go tag in place — bump to the next
patch version and tag that instead.

**npm refuses the publish.** That version already exists. npm does not allow
republishing a version, ever. Bump and re-release.

**npm answers 404 on a `PUT`.** The trusted publisher does not match this
run: wrong owner/repo (the move to `aontu-lang`), wrong workflow filename, or
no registration at all. It is not a missing package.

## The manual paths, and why to prefer the button

Pushing a `v*` tag by hand still triggers `publish.yml`, which publishes the
npm package. It does **not** tag the Go module — the tag job runs only on the
dispatch path.

`npm run repo-tag` (in `ts/`) commits, pushes and tags from whatever branch
is checked out. It predates this workflow and has none of its guards.

`make publish-go V=x.y.z` rewrites `const VERSION`, commits, tags and pushes
in one step — and it is sharper than it looks. It commits to whatever branch
is **currently checked out**, tags that commit, then runs
`git push origin main go/vX.Y.Z`. Run from a feature branch it therefore
publishes an immutable Go module version pointing at unreviewed code, while
pushing a `main` that does not contain that commit at all. The target now
refuses unless you are on `main`, with a clean tree, not behind
`origin/main`.

Prefer the dispatch anyway: it runs the tests and the guards, and it never
commits.

Neither path can double-publish: npm refuses an existing version, which is a
safe way to fail.

**Never run `npm run repo-publish` locally**: it publishes over a token and
bypasses OIDC entirely.
