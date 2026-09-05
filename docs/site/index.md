# aontu.dev — the project site

*Status: plan. Nothing here is built yet. This document decides what the
site is and where every piece of its content comes from; the maintainer
steps that have to happen outside a session — Cloudflare, GitHub, npm,
DNS — are broken out in [`manual-tasks.md`](manual-tasks.md).*

The domain `aontu.dev` is owned. The site it should serve is the
project site for [`aontu-lang/aontu`](https://github.com/aontu-lang/aontu):
what aontu is, the documentation set, and — with equal weight — the
machine surfaces an agent needs to use aontu without a human in the
loop.

The template is **[tabnas.dev](https://tabnas.dev)** (`tabnas/web`): an
Astro site, statically rendered, deployed to Cloudflare Workers, with a
hand-written request Worker in front of the assets for content
negotiation. That stack is not being re-evaluated here. What this
document decides is the part a copy cannot decide for you: which of
tabnas.dev's answers are about tabnas and which are about running a
project site at all.

**Colour, logo and typography are deliberately out of scope.** Launch
on tabnas.dev's neutral structure with its brand tokens replaced by
greys, and treat the visual identity as a later, separable change. The
seam for that is real, not aspirational — see [Theming](#theming).

## The two audiences

tabnas.dev is written for humans and agents at once, and aontu has the
stronger claim to that shape: the
[capability review](../capability-review/index.md) exists precisely
because the question was "what does aontu lack in order to serve as
ground truth *for agents*". G7 built the machine-facing access surface —
`get`, `why`, `set`, the delivery skin. A site that documents that work
in prose alone would be answering its own brief in the wrong format.

So the site has two front doors, and neither is a courtesy version of
the other:

- **A reader** gets pages: what unification is, a tutorial, how-to
  recipes, the language and API references, the trust contract.
- **An agent** gets the same content as markdown at the same URLs
  (`Accept: text/markdown`), plus the things prose cannot carry — the
  error-code registry as JSON, the published grammar for constrained
  decoding, the skill pack, the MCP handshake, an `llms.txt` map.

## Decisions

### D1 — The site lives in a new repo, `aontu-lang/web`

Mirrors `tabnas/web` — org-scoped, so the name needs no adjectives.

Not a directory inside `aontu-lang/aontu`: the site depends on the
*published* `aontu` package (see D3), so keeping it in the engine repo
would put a consumer of version N beside the source of version N+1 and
invite the two to be silently wired together. It also keeps the engine
repo's `make test` free of an Astro build, and lets the site deploy on
merge without every engine commit triggering a deploy.

Consequence: the site is a **fourth thing to keep in step** with the
engine, alongside `ts/`, `go/` and the shared spec. D3 is how that stays
honest rather than aspirational.

### D2 — The site *renders* the documentation; it does not *author* it

This is the decision that most differs from the template, and it is
forced by something aontu already has and tabnas does not.

`ts/test/docs.test.ts` requires every `aontu`-fenced block in
`docs/index.md`, `tutorial.md`, `how-to.md` and `reference-language.md`
to parse, and every one followed by a `json` fence to evaluate to
exactly that. `ts/test/skill.test.ts` does the same for `docs/skill/`.
The documentation set is *already* held to the engine, in the repo where
the engine lives, by a gate that runs on every `make test`.

tabnas/web authors its documentation in the site repo and executes its
examples there (`examples/<id>/`, `tools/test-examples.mjs`). Copying
that model here would mean writing a second copy of the tutorial, the
how-to guides and the reference — and this project has already written
down what happens next, in
[`AGENTS.md`](../../AGENTS.md#known-tsgo-divergences):

> Kept in one place deliberately: the same divergence had been described
> in an AGENTS.md section, a ledger comment and an upstream doc, and they
> drifted apart — the ledger claimed a behaviour was still divergent for
> some time after it had been aligned.

The [progress register](../capability-review/progress.md) exists for the
same reason. A hand-written second copy of the docs on a website is that
failure with a public URL on it.

**So: `docs/*.md` is synced into the site repo, generated and committed,
and rendered.** Site-only pages — the landing page, "why aontu", the
community and comparison pages — are authored in the site repo, because
they have no counterpart in the engine repo to drift from.

The rule to hold: *if a page states what the engine does, the engine
repo is where it is written.* The site may frame it, link it, and set it
in type; it may not restate it.

### D3 — What comes from npm, what comes from git, and what is committed

`ts/scripts/prepack.js` stages two out-of-package trees into the tarball
at pack time — `grammar/` and `docs/skill/` → `skill/` — and rewrites
their relative links so they resolve inside the package. So the
published `aontu` package really does carry the grammar and the skill.
It does **not** carry `docs/` or `test/spec/`: the same script rewrites
`skill/error-codes.md`'s link to `test/spec/errcodes.tsv` into an
absolute repository URL, precisely because that tree "the tarball does
not ship at ALL".

That splits the sources three ways:

| Content | Source | How it reaches the site |
|---|---|---|
| The engine itself (examples on site-authored pages, `/versions.json`) | `aontu` npm package, pinned exactly | `npm ci` |
| The Diátaxis docs (`index`, `tutorial`, `how-to`, `reference-language`, `reference-api`, `explanation`, `trust`, `lsp`) | git | **synced and committed** |
| The error-code registry (111 codes, code/class/since) | `test/spec/errcodes.tsv` in git | **synced and committed**, emitted as JSON |
| `grammar/aontu.gbnf`, `grammar/aontu.lark` | git | **synced and committed**, byte-identical |
| The skill pack | not yet served — see the phase list |
| Capability review G1–G8 + progress register | git | **synced and committed** (optional; see D6) |

> **Built differently from what this table first said, and the difference
> is worth recording.** The original split the sources: npm for the
> grammar and the skill, git for the docs and the registry, on the
> strength of `ts/scripts/prepack.js` staging the first two into the
> tarball. That staging is real — but it landed *after* `0.52.1` was
> cut, so at the version the site first pinned the tarball held
> `["bin","src","dist","LICENSE"]` and the npm route did not exist.
>
> `0.53.0` ships them, so the split is now possible. It was still not
> taken. The sync already checks staleness, already fails on a broken
> link, and already fails when the registry and its class table
> disagree; a second npm-shaped path would add a mechanism without
> adding a guarantee, and leave two answers to "where did this file come
> from". `test/spec/errcodes.tsv` is in no tarball at any version in any
> case. **npm stays the runtime dependency, not a content source.**

"Synced and committed" is the template's own idiom, not an invention:
`tabnas/web` commits generated `src/data/*.json` "because neither source
can be imported", regenerates with `npm run gen-ax-data`, and fails the
build on staleness with `npm run check-ax`. The same two scripts here:

```sh
npm run sync-docs     # rewrite src/content/** and src/data/** from a sibling
                      # ../aontu checkout at the pinned tag
npm run check-sync    # fail if what is committed is not what that tag holds
```

`check-sync` says nothing when the sibling is absent, so a Cloudflare
build — which clones only the site repo — is unaffected. It is a
contributor-side and CI-side gate, in the same shape as `check-ax`.

**Pin the version exactly** (`"0.53.0"`, never `"^0.53.0"`).
`tabnas/web`'s README records what a caret range costs pre-1.0: the site
"sat on a stale `abnf` pin long enough to document a *fixed compiler bug*
as intended behaviour."

Two things the sync must do that a copy would get wrong, both of which
`prepack.js` has already had to solve for the tarball:

1. **Rewrite relative links.** `docs/index.md` links `../ts/`,
   `skill/SKILL.md`, `../../grammar/aontu.gbnf`. On the web those are
   URLs on the site or on GitHub, and which of the two is a per-link
   decision (a link into `ts/src/` is a source link; a link to
   `tutorial.md` is a site route).
2. **Assert every rewrite applied.** `prepack.js` throws when a link it
   means to rewrite is no longer present, on the grounds that shipping
   it unrewritten is exactly the failure the script exists to prevent.
   The sync takes the same line: an unmatched rewrite fails the sync, it
   does not warn.

### D4 — Deployment is copied verbatim from the template

Cloudflare Workers, `output: "static"`, Cloudflare's own Git
integration. **Merging to `main` is the deploy step**; there is no
workflow file, and its absence is not an oversight. `npm run deploy` is
the Builds pipeline's own command and must not be run from a working
tree — that is how a stale `dist/` reaches production.

Copy as-is: `wrangler.json` (rename the Worker to `aontu-web`, routes
`aontu.dev` and `www.aontu.dev` as custom domains, both recorded in the
file rather than left in the dashboard), `.assetsignore`,
`upload_source_maps`, observability.

The hand-written `src/worker.ts` carries over whole, because all four
behaviours it exists for are wanted here:

1. `Accept: text/markdown` on a page URL serves that page's markdown
   twin from the same URL, with `Vary: Accept`.
2. Structured JSON errors on the machine surface (`/api/`,
   `/.well-known/`, anything ending `.json`/`.yaml`/`.tsv`).
3. A recoverable 404 — markdown for a bare client, the designed page
   for a browser, an error object for a program, all three offering the
   same entry points.
4. Headers the files cannot carry: a content type for
   `/.well-known/mcp`, CORS on the public descriptions.

Plus the `www` → apex 301, without which both hosts serve every page.

Two traps the template already documents and a fresh copy would walk
into: Astro middleware cannot do any of this (the Cloudflare adapter
short-circuits prerendered routes to `ASSETS` before middleware runs),
and a static route's response headers are discarded at build time.

### D5 — The playground is phase 4, behind a spike

tabnas.dev's playground imports `@tabnas/parser` into a browser script
tag and runs the real engine client-side. The same move for aontu does
not work off the shelf: `ts/src/lang.ts` imports `existsSync`,
`readFileSync` and `realpathSync` from `node:fs`, `ts/src/type.ts`
imports `node:fs`, and `ts/src/hcanon.ts` imports `node:crypto`.

It is not obviously hard, either. `lang.ts` already takes a `hostfs`
injection point — `null == hostfs ? { existsSync, readFileSync } : {…}` —
which is exactly the seam a browser build needs, and `memfs` is already
a devDependency of the engine. So the shape of the answer is a bundler
alias plus an injected filesystem, and `hcanon`'s `createHash` is the
one genuinely awkward import.

Two candidate resolutions, and the spike decides:

- **Site-side**: Vite aliases for `node:fs`/`node:path`/`node:crypto`,
  with the playground evaluating single in-memory sources only (no
  `@"file"` includes). Cheap, but the site owns a shim for someone
  else's module graph.
- **Engine-side**: the `aontu` package grows a browser export condition
  with the node-only paths excluded. More work, benefits every
  downstream browser consumer, and belongs to the engine repo where the
  test suites are.

Engine-side is the better answer if the spike says it is affordable. It
is not on the launch path either way: a REPL is one `npx` away, and the
site links it.

### D6 — What ships at launch, and what is a page too far

The engine repo holds a great deal of material that is *about the
project* rather than *about using it*: the capability review's eight gap
documents, the progress register, `DIVERGENCE.md`, `ADR.md`,
`use-cases/` with its eleven executed cases, `REVIEW.md`, `BUGS.md`.

Launch renders the **user-facing** set (D3's table, rows 1–5) and links
the rest to GitHub. The capability review is a strong candidate for the
site later — it is the most direct evidence that the agent-facing claims
were designed rather than asserted — but it is a large, cross-linked
corpus whose sync rules are its own problem, and it does not block a
launch.

`use-cases/` is the interesting middle case: eleven executed,
enterprise-shaped models are the best "does this actually work at scale"
evidence the project has. Phase 4, as a `/use-cases` section, once the
sync machinery has proven itself on the simpler docs.

### D7 — The identity questions the site will force

None of these are website work, but the site is where each becomes
visible, so they want settling before launch rather than after:

- **The Go module path is renamed** — `github.com/aontu-lang/aontu/go`,
  in `go/go.mod` and in every import, install line and doc that stated
  it. Deliberate, not a find-and-replace: it breaks every importer,
  which pre-1.0 is a cost worth paying once and never again. Existing
  `go/v*` tags keep resolving under the old path, because their own
  `go.mod` still declares it; tags cut after the rename require the new
  one.
- **Two references to the old owner remain, by choice.** `README.md`'s
  badges, and the `REPO` constant in `ts/scripts/prepack.js` that is
  baked into every published tarball's `skill/error-codes.md`. Both are
  *repository URLs* rather than module paths, and GitHub redirects them.
  The badges additionally point at services — Coveralls, Snyk, DeepScan,
  CodeClimate — registered against the old path, so rewriting the URL
  without re-pointing the service breaks the badge rather than fixes it.
  A site that links its own source still has to pick one, and each of
  those is a link the site would inherit.
- **npm stays unscoped.** `aontu` is published and the name is held;
  there is no reason to move to `@aontu/aontu`. Worth *reserving* the
  `aontu` npm org anyway so `@aontu/*` cannot be squatted (see
  manual task D3).
- **The Voxgig sponsorship banner** in `README.md` — decide whether it
  appears on the site, and where. tabnas.dev's answer is a `/sponsors`
  page rather than a masthead.

### D8 — Publishing and npm trust are already solved, with one catch

`.github/workflows/publish.yml` already publishes `aontu` over OIDC
trusted publishing — no `NPM_TOKEN`, provenance attached automatically.
The site repo publishes nothing and needs no npm trust of its own.

The catch is the org rename. A trusted-publisher record names a
repository and a workflow filename, and the workflow's own header says
so: "the trusted publisher must be registered on npmjs.com against THIS
filename (publish.yml) — renaming this file breaks publishing until the
npm-side config is updated to match." If the record still says
`rjrodger/aontu` while the workflow now runs in `aontu-lang/aontu`, the
next release fails at the publish step — after the tag has been pushed.
Manual task D1 is to check that before it is discovered by a release.

## Route map

Reader-facing:

| Route | Content |
|---|---|
| `/` | What aontu is, the 30-second taste, install |
| `/why` | Why unification rather than merge/override — site-authored |
| `/docs` | The Diátaxis set, synced (D3) |
| `/docs/tutorial`, `/docs/how-to`, `/docs/reference-language`, `/docs/reference-api`, `/docs/explanation` | ditto |
| `/docs/trust` | The trust contract |
| `/docs/lsp` | Language server + editor wiring |
| `/tools` | CLI verbs, LSP, MCP server, `vet-action`, editor plugins |
| `/comparisons` | aontu vs CUE, JSON Schema, Jsonnet, Dhall — site-authored |
| `/community`, `/faq`, `/sponsors` | Site-authored |

Agent-facing, all generated, none hand-edited:

| Route | Built from |
|---|---|
| `/llms.txt`, `/llms-full.txt` | nav + the synced docs collection |
| `/<page>.md` | the built HTML, converted (`tools/gen-markdown.mjs`) |
| `/errors`, `/errors/<code>`, `/errors.json`, `/errors/<code>.json` | `test/spec/errcodes.tsv` → `src/data/error-codes.json` |
| `/skills`, `/skills/aontu` | `node_modules/aontu/skill/` |
| `/.well-known/mcp` | the six `aontu mcp` tools — `vet`, `get`, `why`, `diff`, `canon`, `summary` |
| `/grammar/aontu.gbnf`, `/grammar/aontu.lark` | `node_modules/aontu/grammar/` |
| `/versions.json` | the pin, plus the engine's own `VERSION`, spec-suite size and error-code count |
| `/openapi.json`, `/openapi.yaml`, `/api` | `src/openapi.ts` |
| `/robots.txt`, `/sitemap-index.xml` | routes / `@astrojs/sitemap` |

Two of these are aontu-specific and worth calling out as the reason an
agent would come to this domain at all rather than to GitHub:

**`/grammar/aontu.gbnf` is a stable URL for a constrained-decoding
grammar.** The repo holds it and a test pins it to accept every
canonical form the shared suite produces; a model host that wants to
emit valid aontu needs to *fetch* it, and a raw GitHub URL is not a
contract.

**`/errors/<code>` is the registry, not a copy of it.** 111 codes with a
class and a `since` version, held to both engines by set equality in
`ts/test/spec.test.ts` and `go/spec_test.go`. Serve the class and the
version; serve the *message text* nowhere — tabnas's rule that a
plugin's message stays in its own catalogue applies with more force
here, where the engines are the catalogue and the test suite proves it.

Follow the template's other standing rule too: **do not restate a
version**. The pin and the engine's own `VERSION` are different facts;
where both are visible, state both.

## Theming

Colour and identity are deferred, and the template makes deferring cheap:
`src/styles/tokens.css` is a three-layer system — raw brand scales, then
semantic tokens (`--bg`, `--ink`, `--primary`, …) that components
actually use, then back-compat aliases. Components never reference a raw
scale.

So launch replaces layer 1 with a neutral grey scale and leaves layers 2
and 3 untouched. Adopting a real identity later is an edit to one file.

Carry over the accessibility discipline with it: tabnas's tokens record
which pairs meet WCAG AA and which colour is decorative-only. A grey
launch palette should be AA by construction so that the later brand work
is a change against a known-good baseline rather than a first attempt.

Fonts: the template self-hosts (`public/fonts/`, `src/styles/fonts.css`)
and preloads three faces. Launch with a system font stack — no files, no
preloads, no decision — and revisit with the identity.

## Phases

**Phase 0 — decisions and prerequisites.** D1, D2, D7 settled. Manual
tasks A1–A2, B1, C1 done (domain into Cloudflare, `aontu-lang/web`
created). Nothing to build until the repo exists.

**Phase 1 — the site stands up.** Scaffold from `tabnas/web`; strip
every tabnas-specific page and asset; neutral tokens; `astro.config.mjs`
with `site: "https://aontu.dev"`; `wrangler.json` as `aontu-web`; the
landing page and one synced doc page end to end. *Exit:* `npm run check`
passes and Cloudflare's build of `main` succeeds.

> **This exit criterion originally read "Cloudflare serves it on a
> `workers.dev` subdomain", and that was wrong.** That route is off for
> Workers on this account, and the 404 it returns is indistinguishable
> from a broken Worker — `tabnas-web.<subdomain>.workers.dev` answers
> `error code: 1042` while `tabnas.dev` serves every page. So phase 1
> has no externally reachable URL to check, and the first real
> end-to-end verification is the cutover in phase 3. Which is how it
> actually went.

**Phase 2 — content and the sync.** `sync-docs` + `check-sync`; the full
Diátaxis set rendered; the error registry emitted as JSON; Pagefind
search; `src/worker.ts` and the markdown twins; the site-authored pages.
*Exit:* `npm run check` passes — `check-sync`, `test-examples`, build,
`tsc`, `npm test`, `wrangler deploy --dry-run`.

**Phase 3 — the agent surfaces and cutover.** `llms.txt`, `/skills`,
`/.well-known/mcp`, `/grammar/*`, `/versions.json`, OpenAPI. Then the
custom domains, the `www` → apex 301, and analytics. *Exit:* `aontu.dev`
serves the site; `curl -H 'Accept: text/markdown' https://aontu.dev/docs`
returns markdown.

> **What actually landed, and in what order.** The phases were not run
> as written. Cutover (phase 3's tail) came *before* the agent surfaces,
> because this account serves no `workers.dev` URL and the custom domain
> was the first place anything could be verified at all. The surfaces
> then followed onto a live site.
>
> Done: the sync and its link checker, the full Diátaxis set, the
> markdown twins and the request Worker, both custom domains,
> `/llms.txt` and `/llms-full.txt`, the error registry as pages and
> JSON, `/grammar/*`, `/versions.json`. Still open from phases 2 and 3:
> **Pagefind search**, **`/skills`** and **`/.well-known/mcp`**, the
> **OpenAPI** document, and the site-authored pages beyond the landing
> page (`/why`, comparisons, community).
>
> Since then, out of phase 4: the playground, and the `/use-cases`
> section — a page per executed case, synced from each
> `use-cases/<dir>/README.md` the way the documentation set is, with
> the case table in `use-cases/README.md` supplying the metadata and
> held to the site's manifest in both directions. The diagrams those
> cases carry are drawn as static SVG at build time by a renderer in
> the site repository, because Mermaid lays out in a browser and this
> build deliberately has none. D6 called `use-cases/` "the interesting
> middle case" and deferred it until the sync machinery had proven
> itself; it had.
>
> One thing the phase list never anticipated, and which cost the most:
> the site pinned the newest *published* engine while rendering docs
> from `main`, and for a while those were `0.52.1` and the `0.53.0`
> line — an engine with no verbs at all, documenting thirteen. Closed
> by the release on 2026-08-28. **A plan that syncs docs from one place
> and runs code from another needs to say what happens while the two
> disagree.** This one did not, and the gap it left was not small.

**Phase 4 — the rest.** Playground (D5), brand identity, `/use-cases`,
the capability review, MCP registry listing.

## Gates

`npm run check` is the gate and it runs locally, exactly as in the
template — where the README is blunt that green PR checks "are not
evidence the site works". Its steps here:

```
check-sync       committed docs/registry == the pinned tag
test-examples    every fenced aontu/json pair on a SITE-AUTHORED page,
                 run through the pinned engine — the same rule
                 ts/test/docs.test.ts applies in the engine repo
build            astro build + pagefind + gen-markdown
tsc              types
test             node --test test/*.test.mjs (worker + artifacts)
wrangler deploy --dry-run
```

`test-examples` covers site-authored pages *only*. Synced pages are
already held by `ts/test/docs.test.ts` upstream, and re-running them here
would be a second gate on the same fact — which is the thing D2 exists to
prevent. It is worth a comment in the script saying so, because the
absence looks like an oversight.

## Risks

- **The sync goes stale in the gap between an engine release and a site
  bump.** `check-sync` catches a mismatch against the *pin*, not against
  the newest release. The template has the same hole and answers it with
  a standing rule ("always use the latest modules") plus Renovate; adopt
  both.
- **Rendering someone else's markdown breaks in ways authoring does
  not** — heading levels, relative links, `@"…"` includes in fences that
  reference sibling files the site does not ship. `ts/test/docs.test.ts`
  already excludes multi-file examples for this reason; the site's
  renderer needs the same exclusion and should say why.
- **The identity questions in D7 get answered by the site instead of by
  a decision** — whichever org and module path the site ships with
  becomes the de facto answer.

## Recording the decision

When the site is built, D2 — *the site renders, it does not author* —
belongs in [`ADR.md`](../../ADR.md) as a new entry at the next free
number. It is exactly the kind of decision that file exists for: cheap
to reverse by accident, expensive to have reversed, and invisible in the
diff that reverses it. The other decisions here are implementation
choices and stay in this document.
