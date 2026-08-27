# Aontu web playground

`playground.html` is a single, self-contained static page that runs
the real aontu TypeScript engine entirely in the browser: two editor
panes (source, plus a toggleable schema/general pane), tabbed output
(Generate JSON / Canon / Vet), and Evaluate / Canon / Vet / Subsume
actions over the bundled engine — no server, no network calls, no
external assets. It also shows the canon-hash of the unified document
and supports share links (the documents ride the URL fragment).

Open it from a checkout (`web/playground.html` in any browser) or
serve it from anywhere static — GitHub Pages, an S3 bucket, `python3
-m http.server` — it works as-is, because everything (engine included)
is inlined into the one file.

## Files

| File | What it is |
|---|---|
| `playground.html` | The playground — **generated**, do not edit by hand |
| `playground.template.html` | The page source: UI, styles, app logic, and a `/*__AONTU_BUNDLE__*/` placeholder — edit this |
| `aontu-bundle.js` | The engine (`ts/dist/aontu.js` + dependencies) bundled for the browser as an IIFE exposing `AontuLib` — generated |
| `build/build.mjs` | Bundles the engine with esbuild and inlines it into the page |
| `build/smoke.mjs` | Runs the bundle in a builtin-free `node:vm` context and drives every example the page ships, exactly as the page does |
| `build/shims/` | Browser stand-ins for the Node builtins the engine touches (see below) |

## Rebuilding

After any change to `ts/dist` (i.e. after `make build-ts`) or to
`playground.template.html`:

```sh
cd web/build
npm install        # first time only (installs esbuild)
node build.mjs     # writes ../aontu-bundle.js and ../playground.html
node smoke.mjs     # verifies the bundle behaves like ts/dist
```

Commit the regenerated `aontu-bundle.js` and `playground.html`
alongside the template — like `ts/dist`, the built artifacts are
checked in so the playground works from a plain checkout.

`web/build/node_modules` is ignored (see `../.gitignore` in `web/`).

## How the bundle works

`build.mjs` feeds the committed CommonJS build (`ts/dist/aontu.js`)
to esbuild (`platform: browser`, IIFE, global `AontuLib`,
`keepNames: true` — class names are load-bearing: a scalar kind's
canon is its marker class's constructor name lowercased, so the
minifier must not rename classes). Node builtins are replaced with
shims in `build/shims/`:

- `fs` — a stub: `existsSync` is false, `readFileSync` throws a clear
  "no filesystem in the playground" error.
- `path` — a minimal POSIX implementation of the handful of functions
  the engine calls.
- `crypto` — a pure-JS synchronous SHA-256, just enough for
  `createHash('sha256')`, so `canonHash` works in the browser
  (the smoke test proves it agrees with `node:crypto`).
- `util` — `inspect.custom` only.
- `process` / `Buffer` — minimal injected globals.

The page constructs the engine with
`trust: { include: { mem: {} } }` (the memory include capability, see
`docs/trust.md`), so `@"std/system"` — bundled inside the engine —
still resolves.

## Limitations

- **No file includes.** `@"other.aon"` needs a filesystem; in the
  playground it reports a parse-stage `source not found` error.
  `@"std/system"` works (it ships inside the engine). Use the `aontu`
  CLI for multi-file documents.
- **No modules.** The `mod` machinery (vendored dependency closures,
  lockfiles, caches) is filesystem-based and unavailable for the same
  reason.
- The playground exposes evaluate / canon (+ canon-hash) / vet /
  subsume. The rest of the library surface (`get`, `why`, `diff`,
  `patch`, …) is present in the bundle (`AontuLib` in the console) but
  has no UI yet.
