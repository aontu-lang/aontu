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

## Where this stands

**aontu.dev is live, and runs the engine it documents.** Verified
against the running Worker on 2026-08-27: markdown negotiation returns
`text/markdown` with `Vary: Accept`, `www` 301s to the apex, `/nope`
answers markdown and `/nope.json` a structured error with CORS, `POST`
answers 405.

The machine surfaces followed — `/errors` and `/errors/<code>` over the
111-code registry, `/errors.json`, `/grammar/*` byte-identical to
source, `/versions.json`, `/llms-full.txt` — and the pin moved to
`0.53.0` the day it shipped. Until then the site had been describing a
verb surface `0.52.1` did not have; the landing page said so, and the
test that made it say so deleted the caveat when the pin caught up.

| | Task | State |
|---|---|---|
| A1 | Cloudflare zone (same account as tabnas) | **done** |
| A2 | Nameservers → `fred`/`sofia.ns.cloudflare.com` | **done** |
| A3 | Apex canonical, `www` redirects | **done** |
| B1 | Workers Builds GitHub App on `aontu-lang` | **done** |
| B2 | Worker `aontu-web` + build connection | **done** |
| B3 | No stale secrets | not checked |
| B4 | Custom domains attached | **done** |
| B5 | Web Analytics beacon | open — needs a token or a "no" |
| C1 | `aontu-lang/web` created | **done** |
| C2 | Claude GitHub App on the org | **done** |
| C3 | Repository settings, branch protection, CodeQL | open |
| C4 | Org-rename leftovers | **done** except two account identities — a Marketplace publisher and an action's author |
| C5 | Sponsorship treatment | open — needs a decision |
| D1 | npm trusted-publisher record after the rename | **done** — proven by the 0.53.0 release |

D1 was the one that bit if left. It is closed the only way that really
settles it: the 0.53.0 release published over OIDC on 2026-08-28, so
the record does name `aontu-lang/aontu` and `publish.yml`. Re-check it
after any future org or workflow-file rename, for the same reason.

One thing the build carries that this file did not ask for: the build
token is `tabnas-web-01`, reused rather than minted, because a build
token is account-scoped and A1 chose one account. Nothing is broken, but
the name now lies about what it serves — see the note under B2.

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
> anything earlier: the phases before it never resolve the hostname. So
> start A1/A2 now and let them propagate while the site is built.
>
> They do, however, gate the first VERIFICATION — see B2, which
> originally promised a `workers.dev` URL that this account does not
> serve.

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

**Verify:** merging to `main` produces a successful build in *Workers &
Pages → aontu-web → Deployments*. **That is the whole check available at
this point** — do not reach for a `workers.dev` URL.

That route is off for Workers on this account, and its 404 is
indistinguishable from a broken Worker. Established by comparison rather
than assumed:

```
tabnas-web.<subdomain>.workers.dev  ->  404, "error code: 1042"   # live site
aontu-web.<subdomain>.workers.dev   ->  404, "error code: 1042"   # identical
tabnas.dev                          ->  200
```

A known-healthy Worker returns byte-identical garbage, so the response
says nothing about health. The first URL that can actually be checked is
the custom domain, at B4.

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
site and documentation for aontu.*

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
- Actions: the site has one workflow, `.github/workflows/docs.yml`
  ("Prose gate"), added 2026-09-08 in `23d458b`; the BUILD is still
  Cloudflare's.
  The workflow runs on `push` to `main`, on `pull_request` and on
  `workflow_dispatch`, and does `npm ci`, `npm run build`,
  `node --test test/prose.test.mjs` and a pinned Vale. Nothing to
  enable, then, but not for the reason this file gave until
  2026-09-18: there is a workflow, and it is a second pull-request
  check beside Workers Builds.

### C4. Settle the org-rename leftovers in `aontu-lang/aontu`

Not site work, but the site will publish whichever answer it finds
([plan D7](index.md#d7--the-identity-questions-the-site-will-force)).

**The module path, the badges and `prepack.js` are done.** The module
path is `github.com/aontu-lang/aontu/go`, in `go/go.mod` and every
import, install line and doc that stated it. `README.md` carries two
badges, npm version and build, and the build badge already names
`aontu-lang` — the Coveralls, Snyk, DeepScan and CodeClimate badges
this task was once gated on do not exist, so no service needs
re-pointing. `ts/scripts/prepack.js` sets `REPO` to
`https://github.com/aontu-lang/aontu/blob/main/`.

**Two references to the old owner are left, and neither is a URL.**
This section listed five until 2026-09-18; the three that were URLs or
wire format are gone, and what closed each is below the table, because
the reasons given for holding them are worth keeping.

| Where | What it says | Why it still stands |
|---|---|---|
| `editors/vscode/package.json` | `"publisher": "rjrodger"` | A Marketplace account identity, not a URL. It changes when the account does, and not before. |
| `vet-action/action.yml` | `author: 'rjrodger'` | A person. Correct as it stands. |

The three that closed:

- **The SARIF `informationUri` moved**, in `e3021661` (2026-09-16), as
  the one deliberate commit this section asked for: `ts/src/report-sarif.ts`,
  `go/report_sarif.go`, the golden `test/spec/files/vet-sarif/expect.sarif`,
  the committed `ts/dist` rebuild, and the `web/aontu-bundle.js` and
  `web/playground.html` that inline it. The two sources and the golden
  all read `https://github.com/aontu-lang/aontu`.
- **The OCI annotation keys went with the artifact.** `ts/src/mod-tool.ts`
  and `go/modtool.go` were deleted by `cc240ec0`, and
  [ADR-039](../../ADR.md#adr-039--the-package-system-has-one-vocabulary-one-set-of-files-and-three-pins)
  replaced the OCI artifact with the specification's signed manifest, so
  `com.github.rjrodger.aontu.canon` and `.major` are not written
  anywhere. The ADR this section said the move needed was the ADR that
  removed the question.
- **The playground links moved with the same commit.**
  `web/playground.template.html` and the built `web/playground.html`
  both link `aontu-lang`, and neither the built page nor
  `web/aontu-bundle.js` contains the old owner's name. The bundler-pin
  worry did not arise: `e3021661` changed the template, the built page
  and the bundle together.

### C5. Decide the sponsorship treatment

`README.md` carries a Voxgig banner. Does it appear on the site, and
where? tabnas.dev's answer is a `/sponsors` page rather than anything in
the masthead.

**Hand back:** page, masthead, footer, or nothing.

---

## D. npm

### D1. Verify the trusted-publisher record survived the org rename — **done**

**Settled on 2026-08-28 by a green release**, which is stronger evidence
than `npm trust list`: npm `aontu@0.53.0` published over OIDC with no
token, which only succeeds when the record matches. The procedure below
is kept for the next rename.

`publish.yml` publishes
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

### D3. Create the `aontu` npm org

The package `aontu` is unscoped and yours, and the plan keeps it that
way. The org is a separate need, and it is no longer optional: the
module system publishes under `@aontu`, so the free org has to exist
before the first scoped publish. That first package is `@aontu/mod`,
the transparency client, which has never been published --
`registry.npmjs.org/@aontu%2Fmod` answers `{"error":"Not found"}`. No
version is named here on purpose: this line said 0.1.0 until
2026-09-18, by which time the package was at 0.2.0, and the claim that
matters is that nothing is published rather than which version is not. Stopping someone else
publishing `@aontu/anything` with your name on it is now the second
reason rather than the only one.

This gates the module system's first publish, not the site — nothing
on aontu.dev resolves a scoped name.

Create it at <https://www.npmjs.com/org/create> (the Free plan; scoped
public packages cost nothing), then check rather than assume, because
an org name someone else already holds is refused rather than queued:

```sh
npm org ls aontu           # expect your account, role owner
```

**The org is the first of five steps, not the whole of it.** npm will
not register a trusted publisher for a name that has never been
published — `npm trust`'s manual makes the package's existence a
precondition — so the first publish of `@aontu/mod` cannot come from
CI over OIDC, and the order is bootstrap, then trust, then dispatch.
The sequence, the decision it turns on and the verification are §2 of
[`docs/manual-tasks.md`](https://github.com/aontu-lang/system/blob/main/docs/manual-tasks.md)
in `aontu-lang/system`.

**Hand back:** confirmation the org exists, or the name it had to
become instead.

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

The blocking chain — C1, C2, A1+A2, B1+B2, then B4 — is **done**, and
the site is serving from the apex.

What is left, in the order it will hurt if ignored:

1. **D3** — the free `aontu` npm org. `@aontu/mod` cannot publish until
   it exists, and it is the module system's first scoped package. The
   org is the first of five steps: npm will not trust a publisher for a
   name that has never been published, so the first release is
   bootstrapped by hand and every one after it comes from CI. §2 of
   `aontu-lang/system`'s `docs/manual-tasks.md` has the sequence.
2. **C4** — two account identities, and nothing else: a Marketplace
   publisher and an action's author. The SARIF `informationUri` moved
   on 2026-09-16 and the OCI annotation keys went with the OCI
   artifact, so both of the items this line used to name are closed.
   Of the two left, one changes when the Marketplace account does and
   the other is a person's name and is correct as it stands.
3. **B5 / C5** — the analytics token (or a "no"), and where the
   sponsorship goes.
4. **C3** — branch protection and CodeQL on `aontu-lang/web`. It has
   two pull-request checks: Workers Builds, a real
   `npm ci && npm run build`, and the `docs.yml` prose gate, added on
   2026-09-08. This line read "no workflows by design" for the ten days
   after that workflow landed.

**D1 is closed** — the 0.53.0 release published over OIDC on 2026-08-28,
which proves the trusted-publisher record survived the rename.

None of these block the site. All of them are cheaper now than after
they are forgotten.
