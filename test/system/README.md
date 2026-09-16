# test/system: full systems generated from a model

`test/spec/` pins the language row by row. This directory pins the
other end of the claim: that a model written in aontu, walked into a
**component tree** and written by a generator runtime, produces a
**complete working system**: not a file that looks right, but an
application that boots, serves its API, passes an external validation
written against a reference implementation, and shows a human a page.

A system that stops passing is a defect in the model, the generator or
the engine, never a test to relax.

## Layout

```
test/system/<name>/
  README.md        what the system is, what it is held to, how to run it
  model.aon        the model: the ONE source every generated file reads
  gen/             the generators: aontu (or the template surface),
                   each answering a component tree of one or more files
  ref/             the reference the system is held to, vendored
                   (an OpenAPI spec, a validation script), read-only
  app/             the generated system, COMMITTED, each generated file
                   carrying a banner; plus the hand-written framework
                   boilerplate the model does not decide
  check.sh         compares the tree with `app/`, boots the system, runs
                   the reference validation against it, runs any
                   client-side suite in live mode, fetches the UI pages;
                   exit 1 on any failure
```

Three rules follow from the layout:

- **The generated tree is committed and checked, not regenerated
  silently.** The byte gate is the first step of every `check.sh`, so a
  change to the model or the generator shows as a reviewable diff to
  `app/`, and a hand edit to a generated file is drift the check
  reports. Boilerplate the model does not decide is hand-written once
  and is not banner-marked.
- **The bytes come from the runtime, not from a walker written here.**
  `aontu render --check` hands each generator's tree to
  [jostraca](https://github.com/jostraca/jostraca), a dependency of both
  ports, and holds the committed app to what it writes; a tree checked
  against anything else proves nothing about what a user gets.
- **The API is the reference's, not ours.** A system implements an
  existing API and is validated by that API's own script. What is
  ours is the model, the generator and the framework choice.

## Systems

| system | target | reference | status |
|---|---|---|---|
| [`rb-solar`](rb-solar/) | Ruby on Rails 8, SQLite, Hotwire: the Solar System API (Planet, Moon) and a human UI over the same data | [voxgig-sdk/voxgig-solardemo-sdk](https://github.com/voxgig-sdk/voxgig-solardemo-sdk): its reference app's OpenAPI spec and `app/validate.ts`, and its Ruby SDK | **LANDED 2026-09-06**, on the component road 2026-09-14: 9 checks, the reference's own 20 tests green |

## Running

**The SDK's own suite was tried and rejected as a check.** The plan
named the Ruby SDK's live tests; run against `rb-solar` they pass with
the server turned off: 246 cases, two HTTP requests, lenient by
design. A system's SDK leg is therefore the SDK's real client with
assertions that fail, not the SDK's test suite. `rb-solar/README.md`
records the measurement.

Each `check.sh` is runnable from any cwd and honours `AONTU` (the
engine command; default the TypeScript CLI in this repository) so the
Go port runs the same check. A system's toolchain is documented in its
README, and `check.sh` skips with a note when part of it is absent
rather than failing, so a local run stays possible without it.

**The byte gate never skips.** The runtime is a dependency of the
engine, so a drifted committed file is red locally and in CI alike;
what `check.sh` skips is a system's own toolchain, Ruby or Go.
