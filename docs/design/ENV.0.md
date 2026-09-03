# aontu env — versions of the engine, managed by the engine

**Status:** DRAFT for review, 2026-09-03. Nothing is built. The open
questions of §11 were put to the owner the day the note was written:
X-1 to X-8 decided (each is recorded with its answer); X-9 to X-13
stand as recommended until someone says otherwise. P1 begins on its
own branch once this note is accepted.

**Origin:** Richard Rodger, 2026-09-03: *"Many languages also have a
version manager utility like nvm or uv — aontu can have one built in
from the start — aontu env — this command would operate the version
installs, selection etc."*

**Method:** every claim about what exists *today* is against the tree
at the merge of the install channels (`go/scripts/binaries.sh`,
`install.sh`, the release assets and `docs/release-and-tag.md`, "The
install channels"): two version series, npm at 0.56.0 and the Go
module at 0.1.14, released by one workflow; Go releases carrying
archives with `SHA256SUMS` for six targets; the npm package carrying
thirteen runtime dependencies and three `bin` entries. Claims about
what `aontu env` *should* do are argument, and are marked as such.

---

## 1. What a version manager is for, and why built in

Four situations, each ordinary:

1. A repository of Aontu documents was written against one engine
   version and is evaluated by many machines: developers' laptops, CI,
   a generator in a build. Every one of them should run the same
   engine, or a document that evaluates on one machine fails on
   another, and the hash a pipeline pinned moves.
2. Two repositories on one machine want two versions, because one has
   not upgraded yet.
3. An upgrade should be tried against a project before it is adopted,
   and reverted in one command if it breaks the project.
4. The editor's language server should be the same engine the project
   is pinned to, or the diagnostics in the editor disagree with the
   gate in CI.

Every language with a community has grown a tool for this outside the
language: `nvm` for Node, `rustup` for Rust, `uv` for Python, `gvm`
and then the toolchain directive for Go. The ones that came late are
the awkward ones: shell hooks, shims on `PATH`, three competing tools.
The ones built in early are invisible: `rustup` is what `rustc` *is*
on a developer's machine, and Go's `go` command fetches the toolchain
a module names and nobody thinks about it. This note takes the second
kind. `aontu env` is a verb of the CLI, and the CLI on `PATH` is the
version manager, from the first release that carries it.

### Prior art, and what is taken from each

| tool | model | taken |
| --- | --- | --- |
| `rustup` | the installed `cargo` and `rustc` are proxies; `rust-toolchain.toml` pins; `cargo +nightly` overrides; `rustup self update` | the proxy binary, the `+version` override, self-update, the pin file found by walking up |
| `uv` | one static binary installs interpreters, `.python-version` pins, missing versions are fetched on demand, XDG or `UV_*` directories | on-demand install, the pin file's name shape, one binary with no runtime |
| Go | `go 1.x` in `go.mod`; `GOTOOLCHAIN=auto` downloads and runs the version the module names; `GOTOOLCHAIN=local` refuses | the pin in the project's own configuration, honoured transparently; the local-only switch |
| `nvm` | a shell function rewrites `PATH`; `.nvmrc` | the pin file convention, and the lesson that a shell hook is what every CI job and editor forgets |
| `volta` | shims, pins in `package.json`, per-project tool versions | the pin beside the project's other declarations |
| `corepack` | Node ships a proxy that fetches the package manager a project declares | a proxy that ships with the runtime, not beside it |
| Terraform | `required_version` in the configuration; `tfenv` reads it | a constraint the engine itself verifies, whatever installed it |

## 2. What `aontu env` promises

1. **One binary.** The `aontu` on `PATH` is a complete engine of its
   own version, the editor's language server (`aontu lsp`) *and* the
   multiplexer for every other version. A fresh install works with
   nothing downloaded; a pinned project works with one download, made
   once.
2. **A pin is a promise the engine keeps, not a hint.** A project
   that pins a version runs that version, from the command line, from
   the editor, and in CI, and the engine verifies the pin it is run
   under even when nothing proxied it (§4.2).
3. **Nothing runs unverified.** Every archive is checked against the
   release's `SHA256SUMS` before it is unpacked; every npm install
   goes through npm's own integrity check; nothing executes at install
   time (§6).
4. **Reproducible.** Pins are exact versions. `latest` is resolved
   once, and what it resolved to is what gets written down.
5. **Never silent, never surprising.** A download is announced on
   standard error before it starts; an offline run refuses rather than
   fetching; the wrong version is never run in place of a pinned one.
6. **Both ports, each its own series** (X-3). The npm build manages
   npm releases; the Go build manages Go releases. The verb, its
   options and its help text are the same in both, and a pin names
   its series.
7. **The language changes by one declaration**, `$.aontu_policy.engine`
   (§4.2), beside the `compat` promise the `breaking` verb already
   reads. Nothing else in the language knows the manager exists.
   Nothing else in the CLI does either: `aontu lsp` and `aontu mcp`
   are verbs like the rest, and the proxy resolves before it knows
   which verb it is running.
8. **No shell hook, no `PATH` rewriting, no shims** (X-1). Removing
   `~/.aontu` removes everything but the front binary.

## 3. The model: the proxy

### 3.1 Resolution

Every invocation of `aontu` resolves the version to run, in this
order, and the first that answers wins:

1. **The override argument**, `aontu +0.1.15 fmt …`: the first
   argument, when it begins with `+`, is a version for this invocation
   and is removed before the verb is read (`rustup`'s spelling).
2. **The environment**, `AONTU_VERSION=0.1.15`: a version for this
   shell or this CI job. The running build's series.
3. **The entry document's pin**, `$.aontu_policy.engine` (§4.2), when
   the invocation names a document. The document wins for the file it
   is in (X-2).
4. **The project pin**, `.aontu-version` (§4.1), found by walking up
   from the working directory to the root. The nearest wins.
5. **The default**, from `~/.aontu/env.aon` (§5), set by
   `aontu env default`.
6. **The front binary itself.** No pin, no default: the version on
   `PATH` runs, as it does today.

`aontu env` and `aontu env which` print which of these answered and
with what, so a surprising version is one command from its reason.

### 3.2 The switch

When the resolved version is the front binary's own, the front binary
runs the verb in-process: no second process, no cost. Otherwise it
runs `~/.aontu/versions/<series>/<version>/aontu` with the same
arguments: on Linux and macOS by `exec`, so the versioned binary
inherits the file descriptors, the signals and the exit code with
nothing in between; on Windows, where there is no `exec`, by spawning
it with inherited handles, forwarding Ctrl-C, and exiting with its
exit code (the `rustup` proxies do the same).

The versioned binary is told it was proxied, `AONTU_ENV_PROXIED=1`, and
never resolves again: a loop between two versions is impossible by
construction, and a versioned binary run by hand behaves as a plain
engine.

When the resolved version is not installed, the front binary installs
it first (X-4): it says so on standard error, fetches and verifies the
release (§6), and then switches. `AONTU_ENV_OFFLINE=1`, or
`offline: true` in `env.aon`, turns that into a refusal that names the
command to run, for a CI job that wants every install explicit.

### 3.3 The cost

Resolution is one read of the arguments, one environment lookup, and
at most one small file per directory on the walk up; with no pin
anywhere it is a stat per ancestor and nothing else. No cache is kept
and no daemon runs. The document pin (step 3) is the one read of any
size, and it is a parse with no evaluation (§4.2); a document that
does not parse under the front binary's grammar falls through to the
project pin, and the selected engine reports the parse failure as it
would have anyway.

### 3.4 Where the front binary comes from

The front binary is whatever installed `aontu`: the install script,
a package, the image, `go install`, `npm install -g`. Every channel in
`docs/release-and-tag.md` therefore installs the version manager,
because the version manager is the CLI. `aontu env self update`
(X-8) replaces a front binary that a package manager does not manage:
it fetches the latest release of its series, verifies it, and replaces
its own file, and it steps aside with a message when the binary lives
where a package manager put it (`/usr/bin`, a Homebrew cellar, a Nix
store path, an npm global prefix), because that manager owns it.

## 4. Pins

### 4.1 `.aontu-version`

A text file in the project root. One pin per line, the series and the
version separated by a space; `#` starts a comment; blank lines are
ignored:

```
# the engine this repository is written against
go 0.1.15
npm 0.56.0
```

A build reads the line for its own series and ignores the other (X-5).
A line with a bare version and no series is an error that names the
fix: `.aontu-version:1: "0.56.0" names no series; write "npm 0.56.0"
or "go 0.56.0"`. The file is found by walking up from the working
directory; the nearest wins; `aontu env pin <version>` writes or
rewrites the running build's line in the nearest file, or creates the
file in the working directory when there is none.

The name follows `.python-version` and `.nvmrc`'s convention rather
than a new one, so that editors and CI templates that already look for
such files find it.

### 4.2 `$.aontu_policy.engine`

A document can carry its own pin, as it can carry its compatibility
promise:

```
aontu_policy: hide({
  compat: *backward | forward | full | none
  engine: { go: "0.1.15" npm: "0.56.0" }
})
```

`engine` is a map from series to version; either series may be absent.
Two things read it:

- **The proxy**, before evaluation (§3.1, step 3): the entry document,
  the first document argument of the invocation, is parsed by the
  front binary with no evaluation, as `breaking` reads `compat`, and
  the pin for the running series selects the version. One invocation
  runs one engine: a second document argument that pins another
  version fails its own verification below, which is the honest
  outcome for two documents that disagree.
- **The engine**, at evaluation, whatever started it: when the
  running version differs from the document's pin for its series, the
  evaluation fails with `engine_version`, a finding in the same shape
  every verb reports, naming both versions and the file. This is what
  makes the pin a promise (§2, promise 2): a versioned binary run by
  hand, a `go install` on a laptop, the language server started by an
  editor that bypassed the proxy, all refuse to evaluate a document
  under an engine it did not ask for. The proxy is how the promise is
  kept without anyone noticing.

The document pin wins over the project pin for the file it is in
(X-2), and the project pin covers every document without one.

### 4.3 Exact versions

A pin is an exact version, in both places (X-9, recommended). A range
would make "which version ran" a question with a different answer on
every machine, which is the situation the pin exists to end. Upgrading
is a change to the pin, reviewed like any other change; `aontu env
pin latest` resolves `latest` and writes the number it resolved to.

## 5. The store

`~/.aontu/`, on every platform under the user's home
(`%USERPROFILE%\.aontu` on Windows), and `AONTU_HOME` moves it (X-6):

```
~/.aontu/
  env.aon                       # the settings, an Aontu document
  versions/
    go/0.1.15/                  # a release archive, unpacked and verified
      aontu  aontu-lsp  LICENSE  .verified
    npm/0.56.0/                 # an npm prefix holding aontu@0.56.0
      node_modules/aontu/…  bin/…  .verified
  cache/                        # downloads in flight; safe to delete
```

`env.aon` is the manager's own configuration, written in its own
language and read with its own engine:

```
default: { go: "0.1.15" npm: "0.56.0" }
mirror: "https://github.com/aontu-lang/aontu/releases/download"
registry: "https://registry.npmjs.org"
offline: false
```

`aontu env default <version>` rewrites the line for the running
series. Every field is optional and the file may be absent.

An install is atomic: the archive is fetched to `cache/`, verified,
unpacked into a temporary directory beside its destination, and
renamed into place, with `.verified` written last; a directory without
`.verified` is an interrupted install and is redone. Two installs of
one version at once take a lock file in `cache/`; the second waits and
then finds the version present.

## 6. Sources and verification

**The Go series** comes from the GitHub Release at `go/v<version>`
(`docs/release-and-tag.md`): the archive for the platform and the
release's `SHA256SUMS`, over the same URL shape `install.sh` uses, from
`mirror` when set. `latest` is GitHub's answer for the latest release,
which is never a prerelease. `aontu env list --available` reads the
release list from GitHub's API, and says so when it cannot. An
archive whose sum does not match `SHA256SUMS` is deleted, not
unpacked, and the run fails naming both sums. `aontu env install
--from <archive>` installs a release archive fetched by other means,
for an air-gapped machine, with the sums file beside it.

**The npm series** comes from the registry, `registry` when set:
`latest` is the packument's `dist-tags.latest`; a version is installed
with `npm install --prefix <dir> --ignore-scripts --no-audit --no-fund
aontu@<version>`, so npm's own integrity check covers the package and
its dependencies, and nothing executes at install time. The npm build
is run by Node, and npm is beside Node wherever the npm build was
installed; a machine with the npm build and no `npm` on `PATH` is
refused with a message, since the front binary will not resolve
thirteen dependencies itself.

A version, once installed, is never re-fetched, and never checked
against the network again: the store is trusted after verification,
and `aontu env remove` is how a version leaves it.

## 7. The verb

```
aontu env                          # the state: front version, the resolved version and why, the pins in scope
aontu env list [--available]       # installed versions of this series; with --available, the releases too
aontu env install <version>|latest [--from <archive>]
aontu env remove <version>
aontu env pin <version>|latest     # write this series' line in the nearest .aontu-version
aontu env default <version>        # write this series' default in ~/.aontu/env.aon
aontu env which [<args>...]        # the binary that would run for these arguments, and the reason
aontu env run <version> -- <args>  # one invocation under a version; `aontu +<version> <args>` is the same
aontu env self update|version      # the front binary
aontu +<version> <verb> [args]     # the override
```

Every subcommand takes `--format text|json`, as the report verbs do,
so a CI step can read the state. Exit codes follow the convention the
other verbs keep: `0` done, `2` usage, `4` a version that cannot be
fetched, verified or found. `aontu env` alone, with nothing installed
and nothing pinned, prints one line and exits 0: the front binary,
running itself.

The help text is the same in both builds, and a build's help names its
own series where it matters: "this build manages the npm series".

Environment: `AONTU_VERSION` (the override, §3.1), `AONTU_HOME` (§5),
`AONTU_ENV_OFFLINE`, `AONTU_ENV_PROXIED` (set by the proxy, never by
a person), and `NO_COLOR` as every verb honours it.

## 8. The language server

The language server is `aontu lsp`, a verb, so it needs nothing of
its own (X-7): an editor starts `aontu lsp` in the workspace root,
the proxy resolves the version from that directory exactly as it does
for any verb, walking up for `.aontu-version`, and the server that
answers is the engine the project is pinned to. The standalone
`aontu-lsp` binary, while it ships, resolves the same way when it is
started in a project directory, as a front binary of one verb.

What the proxy cannot do for either is read the document pin before
the handshake: the `initialize` request carries the root, but reading
it means reading standard input that the real server then needs, so
the first release resolves from the directory only, and a document
whose pin disagrees reports `engine_version` in its diagnostics, as it
would from the command line (X-10 for the relay that could do better).
The server's `initialize` answer names its version in `serverInfo`, so
an editor can show which engine it got.

## 9. Worked example

A repository written against Go 0.1.15, on a laptop whose front binary
is 0.1.14:

```
$ aontu env
aontu 0.1.14 (go), the binary on PATH
no pin in scope; no default set; running itself

$ aontu env pin 0.1.15
wrote go 0.1.15 to ./.aontu-version

$ aontu vet schema.aon data.aon
env: installing go 0.1.15 from https://github.com/aontu-lang/aontu/releases/download/go%2Fv0.1.15
env: verified aontu_0.1.15_linux_amd64.tar.gz against SHA256SUMS
ok

$ aontu env
aontu 0.1.14 (go), the binary on PATH
running 0.1.15: pinned by ./.aontu-version

$ aontu +0.1.14 vet schema.aon data.aon
ok

$ AONTU_ENV_OFFLINE=1 aontu +0.1.16 vet schema.aon
env: go 0.1.16 is not installed and this run is offline; run: aontu env install 0.1.16
```

The same repository, with `aontu_policy: hide({ engine: { go:
"0.1.15" } })` in `schema.aon`, evaluated by a versioned binary run by
hand:

```
$ ~/.aontu/versions/go/0.1.14/aontu vet schema.aon data.aon
engine_version [policy]: schema.aon pins engine go 0.1.15; this is go 0.1.14
  --> schema.aon:3:12
```

## 10. Implementation

### 10.1 Where it lives

- TypeScript: `ts/src/env.ts` (the store, the resolution, the sources)
  and the verb in `ts/src/cli.ts`; the proxy step at the top of
  `main`, before verb dispatch, so that it costs nothing when it does
  not apply. The `engine_version` check in the evaluator, beside the
  reading of `aontu_policy.compat`, and its code in the error-code
  registry that `docs/shared-spec.md` and the site's error pages carry.
- Go: `go/env.go` and `go/cmd/aontu/env.go`, function for function
  with the TypeScript; the proxy step in `run` before dispatch; the
  same check in the same place of the evaluator.
- Both language servers: the resolution shared with the CLI of the
  same port, and the exec or spawn before the handshake.

### 10.2 The shared spec, and what it cannot hold

The `engine_version` check is engine behaviour and gets rows in the
shared spec: a document whose pin matches the running version
evaluates; one whose pin does not fails with the code; one with no
pin for the running series evaluates. The runner substitutes the
running version into the row.

The rest is host behaviour, files and processes, which the spec does
not model. Each port carries its own tests, and they are the same
tests: the resolution order over a fixture tree of `.aontu-version`
files and environments; an install against a local copy of the release
assets (the mock the installer's tests already use); a corrupted sum
refused; the proxy's exec observed through an injectable runner, as
the LSP's waiter is injectable today. The parity probe runs both
builds' `env` subcommands against the same fixture store and compares
their `--format json` reports.

### 10.3 ADR-002

Every fetch, exec, spawn and file write goes through an injectable
seam, which is what makes the failure arms (a sum that does not match,
a lock held, an exec that fails) reachable at the 100 % floor without
touching the network or the real home directory in a test.

### 10.4 Phases

| phase | scope | size |
| --- | --- | --- |
| **P1** — the store and the proxy | `~/.aontu`, `env.aon`, resolution order without the document pin, exec and spawn, `+version`, `AONTU_VERSION`; `env`, `list`, `install`, `remove`, `pin`, `default`, `which`, `run`; the Go series from releases and the npm series from the registry; auto-install and offline; both ports; `--format json` | L |
| **P2** — the promise | `$.aontu_policy.engine`, the pre-evaluation read in the proxy, `engine_version` in both evaluators with spec rows, the error-code registry entry; the standalone `aontu-lsp` binary resolving as the verb does | M |
| **P3** — the front binary | `aontu env self update` and `self version`; the step-aside rule for package-manager installs; Windows spawn semantics verified on the Windows runners; `install --from`; `list --available` | M |
| **P4** — the documentation | the how-to "Manage engine versions"; the CLI reference; the install channels' pages saying that every channel installs the manager; `docs/release-and-tag.md` on what a release must carry for `env` to find it | S |

P1 before P2 because a store and a proxy are useful without the
document pin, and the language change deserves its own review.

## 11. Open questions

- **X-1 — The model.** A proxy binary, a Go-style toolchain directive
  with auto-download as the default, or shell `PATH` switching?
  Recommendation: the proxy. **Decided 2026-09-03: the proxy.**
- **X-2 — Where the pin lives.** A dotfile, the document, or both?
  Recommendation: both, the document winning for its own file.
  **Decided 2026-09-03: both.**
- **X-3 — Which builds.** Go builds only with the verb in both CLIs,
  each port managing its own series, or Go only in the Go CLI?
  Recommendation was Go builds only. **Decided 2026-09-03: each port
  manages its own series**, which is why every pin names one (X-5).
- **X-4 — A pinned version that is not installed.** Install and run,
  refuse, or ask? Recommendation: install, with an offline switch.
  **Decided 2026-09-03: install, then run.**
- **X-5 — The pin's shape across two series.** Series-prefixed lines,
  unify the series first, or a bare number read per port?
  Recommendation: series-prefixed. **Decided 2026-09-03:
  series-prefixed.**
- **X-6 — The home.** `~/.aontu` with `AONTU_HOME`, or the XDG
  directories? Recommendation: `~/.aontu`. **Decided 2026-09-03:
  `~/.aontu`.**
- **X-7 — The language server.** Proxied too, or not? Recommendation:
  proxied. **Decided 2026-09-03: proxied**, and made ordinary the same
  day: `aontu lsp` became a verb of the CLI, so the server is proxied
  because every verb is (§8).
- **X-8 — Self-update.** In the first release, later, or never?
  Recommendation: the first release. **Decided 2026-09-03: the first
  release** (it is P3 of this note's phases, in the first release
  that carries `env`).
- **X-9 — Ranges.** Should a document pin accept a constraint,
  `">=0.1.15"`, resolved to the newest installed version that
  satisfies it? Recommendation: no; exact versions in both places
  (§4.3), and revisit when a real project asks for the range.
- **X-10 — The language server and the document pin.** A relay that
  reads `initialize`, resolves from `rootUri`, and forwards the
  request to the child it then starts would let the server honour a
  document pin before the handshake. Recommendation: not in the first
  release; the directory walk covers the common case and
  `engine_version` covers the rest.
- **X-11 — `engine_version` severity.** An error that stops the
  evaluation, or a warning that lets it proceed? Recommendation: an
  error; a pin that can be ignored is a hint, and the note's second
  promise says it is not one.
- **X-12 — Unifying the series.** Both series are major 0, so the Go
  module could take npm's numbers without an import-path change, and
  a pin would then be one number. Recommendation: not as part of this
  work; it is a release-process decision, and the series-prefixed pin
  (X-5) is correct either way.
- **X-13 — Signatures.** `SHA256SUMS` proves the archive is the one
  the release job wrote; a signature (Sigstore, or GitHub's artifact
  attestations) would prove who wrote it. Recommendation: not in this
  note; the install script and `env` would verify it the same way,
  and the release job is where it starts.

## 12. Boundary: what this will not do

- Not a package manager for Aontu modules: that is `aontu mod`, and
  a version of the engine is not a dependency of a document.
- Not a Node or Go version manager. The npm build needs Node, and
  whichever Node is on `PATH` runs it; that is npm's world.
- No shell hook, no `PATH` rewriting, no shims, no daemon, no
  telemetry.
- Nothing outside `~/.aontu` and the pin files it is asked to write.
  It never edits a document: the document pin is authored, and
  `aontu env pin` writes the dotfile only.
- No fallback to a different version than the one pinned. A pin that
  cannot be honoured is an error, not a warning and a wrong answer.

## 13. Risks

- **A proxy in front of every invocation** is a new way for every
  invocation to fail. The mitigation is §3.1's step 6: with nothing in
  scope the front binary runs itself, and a corrupted store affects
  only pinned runs, which then fail naming the version and the path.
- **Two series** will confuse someone who pins `0.56.0` in a Go
  project. The error message names the series and the fix (§4.1), and
  `aontu env` always prints the series beside a version.
- **Windows has no `exec`**, so the spawn path must forward signals
  and the exit code by hand; the Windows runners in `build.yml` are
  where that is proven, in P3.
- **Reading the document pin needs a parse** by the front binary, and
  a document written for a newer grammar may not parse under an older
  front binary. It then falls through to the project pin (§3.3), which
  is why the how-to will say to write both when the grammar is ahead.
- **CI without network** would hang on a download that never comes;
  `AONTU_ENV_OFFLINE=1` in the job, or the setup action installing the
  pinned version explicitly, is the answer, and the how-to says so.
