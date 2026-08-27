# aontu.dev — maintainer tasks

The steps for standing up [aontu.dev](index.md) that **cannot** be done
from an agent session: they need credentials, a web UI, DNS control, or
a decision that is yours. Everything else is session work and is not
listed here.

Order matters in two places only, and both are marked. The rest can be
done in any order, and several can wait until the phase that needs them.

Each task says what to do, how to check it worked, and — where relevant
— **what to hand back**, meaning a value or a decision a session needs
before it can write the corresponding config.

---

## A. Domain and DNS

### A1. Add `aontu.dev` as a zone in Cloudflare

Cloudflare dashboard → *Add a site* → `aontu.dev` → Free plan is
sufficient (the site is static assets on Workers).

**Decide first:** the same Cloudflare account as `tabnas.dev`, or a
separate one? Same account is simpler — one dashboard, one set of build
credentials, and the Workers Builds GitHub App is already installed.
Separate is cleaner if aontu is ever to be owned or transferred
independently. There is no technical reason the Worker and the zone must
share an account with tabnas; there *is* a requirement that the zone and
the Worker share an account with **each other**, because a
`custom_domain` route can only bind to a zone in the Worker's own
account.

**Hand back:** which account, and whether it is the tabnas one.

### A2. Point the registrar's nameservers at Cloudflare

At whoever `aontu.dev` is registered with, replace the nameservers with
the two Cloudflare gives you in A1.

**Verify:** the zone flips to *Active* in the Cloudflare dashboard
(minutes to a few hours), and:

```sh
dig +short NS aontu.dev        # expect the two ns.cloudflare.com names
```

> **Ordering constraint.** A1 and A2 must complete before the deploy
> that carries the custom-domain routes (B4). They do **not** block
> anything earlier: phase 1 deploys to a `workers.dev` subdomain and
> needs no DNS at all. So start A1/A2 now and let them propagate while
> the site is being built.

### A3. Decide the canonical host

`aontu.dev` apex, with `www.aontu.dev` 301-ing to it — matching
tabnas.dev, and matching what `src/worker.ts` already implements. Both
are registered as custom domains on the same Worker; the redirect is
code, not DNS.

Say so explicitly if you want the opposite (`www` canonical), because it
inverts the redirect at the top of the Worker's `fetch()`.

**Hand back:** confirmation, or the other choice.

---

## B. Cloudflare

### B1. Authorize the Workers Builds GitHub App on `aontu-lang`

Cloudflare dashboard → *Workers & Pages* → *Create* → *Import a
repository*. If the GitHub App is installed for `tabnas` but not
`aontu-lang`, you will be prompted to install it; grant it access to
`aontu-lang/web` **only**, not all repositories.

*Depends on C1 — the repo must exist to be selected.*

### B2. Create the Worker and connect the build

Same flow: pick `aontu-lang/web`, production branch `main`.

| Setting | Value |
|---|---|
| Worker name | `aontu-web` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Root directory | `/` |
| `NODE_VERSION` (build env var) | `24` |

Two notes on that table. The deploy command is `npm run deploy` **on
purpose**: it is the pipeline's own deploy step, which is why the same
script must never be run from a working tree — doing so publishes
whatever `dist/` happens to be sitting there. And `NODE_VERSION=24`
rather than the Astro minimum, because the `aontu` package declares
`engines: {"node": ">=24"}` and the build imports it.

**Verify:** merging to `main` produces a build in *Workers & Pages →
aontu-web → Deployments*, and the site answers on
`aontu-web.<subdomain>.workers.dev`.

### B3. Confirm no stale secrets on the Worker

New Worker, so there should be none. Worth one look at *Settings →
Variables and Secrets* after the first deploy: the template carries a
note that `tabnas-web` was left holding an inert `SITE_PASSWORD` from a
since-removed Basic-Auth gate. Don't inherit a habit of leaving them.

### B4. Attach the custom domains — *phase 3, after A2 is Active*

`wrangler.json` declares them:

```json
"routes": [
  { "pattern": "aontu.dev", "custom_domain": true },
  { "pattern": "www.aontu.dev", "custom_domain": true }
]
```

so they are attached by the deploy, not by clicking — provided the zone
is active in the same account (A1). Nothing to do in the dashboard
except watch it work. Keeping the routes in the file is deliberate:
tabnas's lived in the dashboard until August 2026, "which meant nothing
in this repo recorded what actually served the site."

**Verify:**

```sh
curl -sI https://aontu.dev/            | head -1   # 200
curl -sI https://www.aontu.dev/        | head -1   # 301 -> https://aontu.dev/
curl -s -H 'Accept: text/markdown' https://aontu.dev/docs | head -5
```

### B5. Web Analytics beacon — optional

*Analytics → Web Analytics → Add a site* → `aontu.dev`. Copy the beacon
token and set it as a **build** environment variable in B2:

```
PUBLIC_CF_BEACON = <token>
```

Cookieless, so no consent banner. If it is unset the analytics component
renders nothing at all, so skipping this is a supported state rather
than a broken one.

**Hand back:** the token, or "no analytics".

---

## C. GitHub

### C1. Create `aontu-lang/web`

Public, empty (no auto-generated README — the scaffold brings its own),
MIT to match the org. Description: *Source of aontu.dev — the project
site and documentation for Aontu.*

**This blocks B1/B2 and all site work.** It is the one task that gates
everything.

**Hand back:** confirmation of the name. `web` mirrors `tabnas/web`; say
so now if you would rather have `site` or `aontu.dev`, because it is
cheap today and a rename later moves the Cloudflare build connection
with it.

### C2. Grant this Claude session access to the new repo

The session's repository scope is fixed at start. Once C1 exists, either
grant access at <https://claude.ai/admin-settings/claude-tag> (org
owner) or reconnect GitHub under *Settings → Connectors*, and tell me —
I can then attach it to a session and push the scaffold.

Until then, no session can write to it.

### C3. Repository settings on `aontu-lang/web`

Match the template's posture:

- Branch protection / ruleset on `main`: require a pull request, no
  force-push, no deletion.
- CodeQL **default setup** (*Settings → Code security*) — one click.
- Disable Issues if the engine repo is the intended front door for bug
  reports, or leave them on and say in the README which repo takes what.
- Actions: nothing to enable. The site has **no** workflows by design;
  the build is Cloudflare's.

### C4. Settle the org-rename leftovers in `aontu-lang/aontu`

Not site work, but the site will publish whichever answer it finds
([plan D7](index.md#d7--the-identity-questions-the-site-will-force)).

**The module path is done** — `github.com/aontu-lang/aontu/go`, in
`go/go.mod` and every import, install line and doc that stated it. Two
references to the old owner are left standing, and both want a
credential or a click before the URL can honestly change:

| Where | What it says | Why it is still yours |
|---|---|---|
| `README.md` badges | `rjrodger/aontu` — build, coverage, Snyk, DeepScan, CodeClimate | Each badge is a *service* registered against the old path. Rewriting the URL first breaks the badge; re-point the project in Coveralls, Snyk, DeepScan and CodeClimate, then the URL follows. |
| `ts/scripts/prepack.js` | `REPO = 'https://github.com/rjrodger/aontu/blob/main/'`, baked into every published tarball's `skill/error-codes.md` | A repository URL, not a module path, and GitHub redirects it. Safe to change on your word — it just wants a release to take effect. |

A third sits alongside them: `go/report_sarif.go` and its TypeScript
twin both emit `informationUri: "https://github.com/rjrodger/aontu"`,
held byte-identical across the two ports by the golden
`test/spec/files/vet-sarif/expect.sarif`. Changing it means all three
files plus a rebuild of the committed `ts/dist` — a deliberate edit, not
a sweep.

**Hand back:** say the word and the `prepack.js` constant and the SARIF
URI go in one commit; the badges after you have re-pointed the four
services.

### C5. Decide the sponsorship treatment

`README.md` carries a Voxgig banner. Does it appear on the site, and
where? tabnas.dev's answer is a `/sponsors` page rather than anything in
the masthead.

**Hand back:** page, masthead, footer, or nothing.

---

## D. npm

### D1. Verify the trusted-publisher record survived the org rename

**Do this before the next release, not after.** `publish.yml` publishes
`aontu` over OIDC with no token, and a trust record names a *repository*
and a *workflow filename*. If the record still says `rjrodger/aontu`,
the next release fails at the publish step — after the version bump and
the tag have already been pushed.

```sh
npm i -g npm@latest        # need >= 11.15.0 for `npm trust`
npm login                  # account-level 2FA required
npm trust list aontu
```

Expect a record naming repository `aontu-lang/aontu` and file
`publish.yml`. If it names the old repo, add the correct one:

```sh
npm trust github aontu --file publish.yml --repo aontu-lang/aontu --allow-publish
```

Three things the fleet already learned the hard way, from
`tabnas/admin`'s `rollout/setup-npm-trusted-publishing.sh`:

- `npm trust` is **interactive** — it prints a summary, asks to proceed,
  and on first use prints an auth URL and waits on ENTER. Do not pipe or
  capture it; it will look frozen while it blocks on stdin.
- A `409` means a record already exists. That is success, not failure.
- `npm trust list`'s output format has changed between npm majors and
  broken scripts that parsed it. Read it yourself here rather than
  grepping.

The first call prompts for a 2FA OTP and then lets you skip 2FA for
about five minutes.

### D2. The site repo needs no npm anything

`aontu-lang/web` publishes nothing — no package, no Go module, no
trusted publisher, no `NPM_TOKEN`. It only *consumes* `aontu` from the
public registry. Listed so its absence reads as a decision.

### D3. Reserve the `aontu` npm org — optional

The package `aontu` is unscoped and yours, and the plan keeps it that
way. Creating the free `aontu` org anyway costs nothing and stops
someone else publishing `@aontu/anything` with your name on it.

---

## E. Later, and explicitly not blocking

| Task | When |
|---|---|
| Register the MCP server in the public registry (`registry.modelcontextprotocol.io`) so agents can discover `aontu-mcp` by name | After `/.well-known/mcp` is live (phase 3) |
| Install Renovate on `aontu-lang` so the exact `aontu` pin gets a bump PR on each release | Phase 2+, once the pin exists to bump |
| A status/measure dashboard, as `tabnas/status` does via GitHub Pages | Phase 4 |
| Decide whether `docs.aontu.dev` or `mcp.aontu.dev` are ever wanted as separate Workers | Not now — the apex serves both |
| Brand: logo, palette, typography | Deliberately deferred; see [Theming](index.md#theming) |

---

## The short version

Blocking, in order:

1. **C1** — create `aontu-lang/web`.
2. **C2** — grant session access to it.
3. **A1 + A2** — `aontu.dev` into Cloudflare, nameservers switched. Start
   these now; they propagate while the site is built.
4. **B1 + B2** — connect the repo to Workers Builds as `aontu-web`.

Then B4 at cutover, and D1 before the next engine release.

Decisions I need from you before the scaffold can be written: which
Cloudflare account (A1), the sponsorship treatment (C5), and the
analytics token or a "no" (B5). The repo name (C1) is settled as
`aontu-lang/web`, and the Go module path (C4) is renamed.
