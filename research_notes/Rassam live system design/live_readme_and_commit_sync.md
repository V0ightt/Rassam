# Live README system design and per-commit sync: what is possible

Research date: 2026-11-22. Scope: can Rassam (a) update the system-design view automatically on each push and (b) embed a live "what is running" preview of the whole design in a GitHub README.

Evidence labels used below:

- **[measured]** I ran the request myself on 2026-11-22 (curl against GitHub, Camo, shields.io, or GitHub's `/markdown` rendering API).
- **[doc]** stated in the linked official documentation.
- **[community]** reported by third parties; plausible but not official.
- **[unverified]** from memory or inference; not confirmed in this session.

---

## 1. What a GitHub README can render

### 1.1 HTML subset (measured through `POST https://api.github.com/markdown`, mode `gfm`)

I posted a test document and read back the sanitized HTML. **[measured]**

| Input | Result |
|---|---|
| `<picture><source media="(prefers-color-scheme: dark)" srcset=…><img …></picture>` | Kept. Wrapped in `<themed-picture>`; both `srcset` and `src` rewritten to Camo URLs. This is the supported way to ship light and dark variants. |
| `<img width height align alt>` | Kept. |
| `<img style=… onclick=…>` | `style` and `onclick` stripped. |
| `<img usemap="#m">` + `<map><area href=…></map>` | The `usemap` attribute survives but `<map>` and `<area>` are removed, so **HTML image maps do not work**. |
| inline `<svg>…</svg>` | Removed entirely. SVG is only usable as an image reference. |
| `<iframe>`, `<style>`, `<script>` | Escaped to visible text (the GFM "disallowed raw HTML" behaviour). |
| `<object>`, `<video>` (in markdown source) | Removed. |
| `<details open><summary>` | Kept. |
| `<a href><img></a>` | Kept; `rel="nofollow"` added. |
| `<table><td align width>` | Kept; `bgcolor` stripped. |
| `<div align="center" class id>` | `align` kept, `class` stripped, `id` prefixed `user-content-`. |
| `<!-- marker -->` comments | Removed from output (content between two markers still renders). Good for generated-block markers. |
| ```` ```mermaid ```` block | Replaced by a placeholder that loads `https://viewscreen.githubusercontent.com/markdown/mermaid` in an iframe on a separate origin. |

Official docs confirm `<picture>` support and relative image paths, and recommend relative links for in-repo images. **[doc]** https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax

Mermaid, GeoJSON, TopoJSON and ASCII STL are the only built-in diagram languages. Put `info` in a mermaid block to see GitHub's Mermaid version. **[doc]** https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams

Mermaid `click NODE href "…"` links: Mermaid disables click handling at `securityLevel: strict`, its default (https://mermaid.js.org/config/usage). Whether GitHub's iframe enables them is **[unverified]**; test in a real README before relying on it. Mermaid on GitHub gives no control over layout, large graphs become unreadable, and it cannot be "live" because it is static text in the file.

### 1.2 SVG referenced as an image

- Browsers run SVG-in-`<img>` in a restricted image mode: JavaScript disabled, external resources (fonts, images, stylesheets) not loaded unless inlined as `data:` URLs. **[doc]** https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
- Consequence: `<a>` elements inside the SVG are **not clickable**, and there are no hover tooltips or pointer events. The whole image can only be one link target (`<a href><img></a>`). **[unverified by direct browser test; it follows from the image context and matches community reports]**
- CSS animations (`@keyframes` in an inline `<style>`) and SMIL (`<animate>`) do play in READMEs. **[community]** egghead lesson on inline CSS animation in profile SVGs; tomchen/animated-svg-clock notes animation plays while JS does not. So a pulsing status dot is possible; a clickable node is not.
- `prefers-color-scheme` media queries inside the SVG's own `<style>` are **[unverified here]**; the `<picture>` route is the documented one.
- Fonts: only system fonts or fonts embedded as `data:` URLs.
- Response headers add a second lock. Camo serves `Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'`. raw.githubusercontent.com serves `default-src 'none'; style-src 'unsafe-inline'; sandbox`. So even when a reader opens the SVG directly in a tab, scripts do not run and nothing external loads. **[measured]**

### 1.3 Clickable regions: the working alternatives

1. One `<a><img></a>` per region: per-component images (badges or cards) laid out with a markdown table or `<p align="center">`. Upptime does this (table rows, each with its own linked badges). **[measured from Upptime README source]**
2. One big image wrapped in a single link to the interactive canvas (hosted app or GitHub Pages).
3. A generated legend table below the image: one row per component, linking to its path in the repo and to its deployment/health URL.

### 1.4 Camo image proxy and caching

- External image URLs in rendered markdown are rewritten to `https://camo.githubusercontent.com/<hmac>/<hex-of-url>`. **[measured]** Images referenced by relative path are not proxied; they are served from `github.com/<o>/<r>/raw/<ref>/<path>`, which 302-redirects to raw.githubusercontent.com. **[measured]**
- Camo sits behind Fastly/Varnish and **passes the origin's `Cache-Control` through**. Measured on 2026-11-22:
  - shields.io endpoint badge via Camo: `Cache-Control: max-age=300, s-maxage=300`, `X-Cache: MISS`.
  - an `.ico` via Camo: `max-age=2592000`, `Age: 731178`, `X-Cache: HIT` (held for 8+ days, as its origin asked).
  - shields.io direct, GitHub workflow status badge: `max-age=60, s-maxage=60`.
  - github-readme-stats public instance: `max-age=86400`.
  - GitHub's native workflow badge (`…/actions/workflows/x.yml/badge.svg`): `max-age=300, private`.
  - raw.githubusercontent.com SVG: `max-age=300` plus a strong `ETag`.
- GitHub's guidance: if an image does not update, check its `Cache-Control`; if you own the server set `Cache-Control: no-cache`; as a last resort `curl -X PURGE <camo-url>`, used sparingly because it forces every user to re-request. **[doc]** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls
- PURGE works unauthenticated: it returned `{ "status": "ok", "id": "…" }`. **[measured]** Community Actions (camo-buster, action-camo-purge) scrape the rendered README for Camo URLs and purge each after a push. **[community]**
- Limits from the open-source Camo (archived 2021; GitHub's production fork may differ): 5 MiB max content length, 10 s origin timeout, 4 redirects, content-type allowlist (`image/svg+xml` is accepted, as measured). **[doc for the OSS project; unverified for production]** https://github.com/atmos/camo
- Camo fetches anonymously: no cookies, no auth. Any image it serves is public to anyone holding the URL, and a token in the query string is visible to every README viewer.
- Camo behaviour for `no-cache`/`max-age=0` with `ETag` revalidation is **[unverified]**. Practical reading: the origin's max-age is the staleness bound at the CDN, plus the reader's browser cache for the same period. There is no push channel; a reader sees new state only on page load.

### 1.5 How shields.io keeps badges fresh

- Endpoint badge: `https://img.shields.io/endpoint?url=<json-url>`; JSON is `{schemaVersion: 1, label, message, color, labelColor, isError, namedLogo, logoSvg, style}`. `cacheSeconds` can only raise the cache time; values under the per-badge default are ignored. **[doc]** https://shields.io/badges/endpoint-badge Mirrors of the docs give 300 s as the endpoint-badge floor, which matches the measured `max-age=300`. **[measured + community]**
- So a shields endpoint badge is at best about 5 minutes stale at the CDN, plus up to 5 minutes for the JSON when it is hosted on raw.githubusercontent.com. Worst case about 10 minutes after the data changes.

---

## 2. Auto-updated diagrams committed by CI

### 2.1 The common pattern

1. Workflow on `push` to the default branch (optionally with `paths:` filters).
2. Regenerate the artifact (SVG, PNG, or a markdown block).
3. Rewrite only the region between markers in README, e.g. `<!-- rassam:start -->…<!-- rassam:end -->`. Upptime uses `<!--start: status pages-->…<!--end: status pages-->` with a "do not edit" comment. **[measured]**
4. Commit only if `git diff --quiet` reports a change; push with the job token.

Reference implementations: githubocto/repo-visualizer (inputs `output_file`, `should_push`, `commit_message`, `branch`, `artifact_name`; commits `diagram.svg` by default; **archived 2026-08-06**) **[doc]** https://github.com/githubocto/repo-visualizer ; stefanzweifel/git-auto-commit-action; Upptime.

### 2.2 Permissions and loop safety

- The job needs `permissions: contents: write`. Keep it on that one job.
- Pushes made with `GITHUB_TOKEN` do **not** start new workflow runs (exceptions: `workflow_dispatch`, `repository_dispatch`; `pull_request` opened/synchronize/reopened runs are created in an approval-required state). They also do not trigger a Pages build. **[doc]** https://docs.github.com/en/actions/concepts/security/github_token This is the built-in loop guard. Side effect: the generated commit gets no CI run, so a required status check on that commit never reports.
- Extra guards: `[skip ci]` in the message (recognised: `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`; only for `push` and `pull_request`; skipped required checks stay "Pending") **[doc]** https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs ; `paths-ignore` for generated files; a `concurrency` group so two pushes do not race.
- Protected branches: a direct push by `GITHUB_TOKEN` fails with GH006 when reviews or status checks are required. Workarounds are a PAT/GitHub App token with bypass rights (which then *does* trigger workflows, so loop guards become mandatory) or opening a PR instead of pushing. **[community]** git-auto-commit-action issues; posit forum thread.
- Fork PRs: `GITHUB_TOKEN` is read-only and secrets are not passed. **[doc]** https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows Never commit generated files into fork PR branches. `pull_request_target` runs with base-repo privileges and must not build or run PR code.
- Noise cost: one bot commit per human commit pollutes history, leaves the pusher's branch behind, and creates README conflicts for open PRs. Deterministic output (stable ordering, no timestamps in the file) keeps commits rare.

### 2.3 Alternatives that avoid committing to the main branch

| Option | How | Trade-off |
|---|---|---|
| Orphan data branch (`rassam-live`, like `gh-pages`) | Workflow force-pushes generated SVG/JSON there; README references `https://raw.githubusercontent.com/<o>/<r>/rassam-live/system.svg` | No noise on main, no branch-protection conflict, no PR conflicts. The absolute URL goes through Camo; raw sends `max-age=300`, so about 5 min staleness (purge Camo after push to shorten). Does not work for private repos (Camo is anonymous). Forks show the upstream image. |
| GitHub Pages via Actions | `actions/upload-pages-artifact` + `actions/deploy-pages` (`pages: write`, `id-token: write` **[unverified, from memory]**) | Hosts the SVG and a fully interactive HTML canvas at `<owner>.github.io/<repo>/`. No commits. Pages CDN cache duration **[unverified]**. |
| Workflow artifact | `actions/upload-artifact` | Not embeddable (auth required, expires). Useful only as input to a later `workflow_run` job. |
| PR sticky comment | `marocchino/sticky-pull-request-comment` with `pull-requests: write`; for fork PRs use the two-workflow `workflow_run` pattern where the privileged job only reads an artifact and never runs PR code **[community]** | The right place for an architecture diff. Mermaid in a comment renders natively, so no image hosting is needed. |
| Job summary | `$GITHUB_STEP_SUMMARY` accepts markdown **[Mermaid rendering there unverified]** | No extra permissions, works on fork PRs, but lives on the run page rather than the PR conversation. |

---

## 3. "What is running": liveness sources without an installed agent

| Source | What it tells you | Access | Notes |
|---|---|---|---|
| GitHub Deployments + statuses | Per environment: latest deployment SHA, state (`error`, `failure`, `inactive`, `in_progress`, `queued`, `pending`, `success`), `environment_url`, `log_url` | `GET /repos/{o}/{r}/deployments`, `…/deployments/{id}/statuses`; public repos readable unauthenticated (measured HTTP 200) | Statuses older than 90 days are deleted; the current status is kept. **[doc]** https://docs.github.com/en/rest/deployments/statuses This says "version X was deployed successfully", not "it is up now". |
| Vercel / Netlify / Fly / Render | Same, via each vendor's GitHub integration | Vercel writes GitHub Deployments and emits `deployment_status` events **[doc]** https://vercel.com/docs/git/vercel-for-github ; Netlify, Fly, Render **[unverified]** | The GitHub Deployments API is the vendor-neutral path; vendor APIs need per-vendor tokens. |
| Actions workflow runs | Last conclusion per workflow/branch | `GET /repos/{o}/{r}/actions/runs`; native badge SVG | Proves "builds and tests pass", not "is running". |
| Health-check URL | Actual liveness (HTTP status, latency) | Probe from a scheduled Action or a hosted endpoint | The only agentless source of real up/down. Needs a declared URL per component. |
| Upptime | Up/down, response time, uptime % | Entirely inside a repo | See 3.1. |
| Status pages | Third-party dependency status | Statuspage-style JSON summaries **[unverified, from memory]** | Useful for external components (database vendor, auth provider). |
| OpenTelemetry service graph, Datadog service map, Kubernetes | True runtime topology and health | Need a collector, vendor keys or cluster credentials | Out of reach for a repo-only tool; possible later as adapters that write the same status JSON. **[unverified, general knowledge]** |

### 3.1 How Upptime makes a README "live" (measured from the upptime/upptime repo)

- `uptime.yml` runs on `cron: "*/5 * * * *"` plus `repository_dispatch` and `workflow_dispatch`, with a `concurrency` group.
- Each check writes `history/<slug>.yml`; summaries go to `api/<slug>/uptime.json` etc. in shields endpoint format (`{"schemaVersion":1,"label":"uptime","message":"100%","color":"brightgreen"}`).
- README rows embed `https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<o>/<r>/HEAD/api/<slug>/uptime.json` wrapped in links, plus PNG graphs committed under `graphs/`.
- The README status table sits between marker comments and is rewritten by a workflow; commit messages carry `[skip ci]`.
- Incidents are GitHub Issues; the status site is GitHub Pages reading the GitHub API. **[doc]** https://upptime.js.org/docs/
- Cost: thousands of bot commits. That is the price of using git as the database.

### 3.2 Realistic freshness

- `schedule` minimum interval is 5 minutes; runs "can be delayed during periods of high loads", may be dropped, run only on the default branch, and are disabled in public repos after 60 days without activity. **[doc]** events-that-trigger-workflows page. Typical real delays of 5–20+ minutes are **[community/unverified]**.
- Add CDN staleness: raw 5 min + shields 5 min, or your own endpoint's max-age.
- Honest numbers: **Actions-only: typically 5–15 minutes, occasionally 30+. Hosted endpoint with `max-age=60`: about 1–2 minutes at page load.** Continuously updating state inside a README is not possible: no JS, no refresh, CDN cache, and the reader must reload.

---

## 4. Dynamic SVG endpoints

- Pattern: `GET /api/live/<owner>/<repo>.svg` returns `Content-Type: image/svg+xml; charset=utf-8`. github-readme-stats (Vercel, `max-age=86400` on the public instance) and shields.io (60–300 s) are the reference designs. **[measured]**
- Because Camo passes `Cache-Control` through, the endpoint chooses its own freshness. Recommended: `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=30` plus a strong `ETag` derived from (blueprint SHA, status hash, theme). `no-cache` is what GitHub documents for always-fresh images, but it sends every README view to your origin; shields will not go below 60–300 s for that reason.
- Rate limits and abuse:
  - GitHub REST: 60 req/h unauthenticated per IP, 5,000/h per user token, 5,000–12,500/h per GitHub App installation, 1,000/h per repo for `GITHUB_TOKEN`. **[doc]** https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api A public SVG endpoint that calls GitHub per request exhausts a shared token quickly; github-readme-stats' public instance is described as best-effort and tells users to self-host. **[community]**
  - Mitigations: cache computed state keyed by repo + commit SHA; conditional requests (`If-None-Match` returned `304` in my test; docs say authenticated 304s do not count against the primary limit); cap SVG size and render time; require the repo to have opted in (blueprint present); SSRF guards on health probes (block private ranges, limit redirects, short timeouts). Health URLs must come from the committed blueprint, never from query parameters.
- Private data: Camo fetches anonymously and its URL is visible to every reader, so a token in the image URL is a bearer secret. GitHub's own private attachments use JWT URLs that expire in about 5 minutes **[community]**, which a static README cannot reproduce. For private repos use the committed-SVG path (relative image, served under the viewer's own repo access).
- Vercel OG / satori renders images from JSX at the edge; not needed, since Rassam can emit SVG strings from the isomorphic engine. **[unverified, general knowledge]**

---

## 5. Prior art

| Project | What it did | Lesson |
|---|---|---|
| GitHub Next "Visualizing a codebase" / repo-visualizer (Amelia Wattenberger) | Action renders a React component with `renderToStaticMarkup` and commits `diagram.svg`; README embeds it. File-tree circle packing, not architecture. The write-up lists history, recency and change-frequency views as future work and says import edges were too many to show except on hover. Archived 2026-08-06. https://githubnext.com/projects/repo-visualization/ | The commit-an-SVG pattern is proven. A static image cannot show hover detail, so it must be legible without interaction. |
| CodeSee Maps / Review Maps | Auto-generated dependency maps that "stay up to date as you merge", with PR review maps. Acquired by GitKraken May 2024 (https://www.gitkraken.com/blog/gitkraken-launches-devex-platform-acquires-codesee); a founder post announced shutdown of commercial operations on a Feb 22 (year not confirmed here). | Hosted auto-maps did not sustain a standalone business. I found no solid user-sentiment sources; "hairball on large repos" criticism is **[unverified]**. |
| Windsurf Codemaps (Cognition, Nov 2025) | LLM-generated, task-scoped maps linked to code; shareable behind team auth. Cognition's blog calls a map a point-in-time capture; the docs say nothing about auto-refresh. https://cognition.com/blog/codemaps | Generated per question, not a maintained contract; no per-commit sync, no README embed. |
| GitDiagram, Swark | LLM turns a repo into a Mermaid diagram. Known failure: invalid Mermaid; maintainers call it an LLM limitation. Run-to-run variance **[unverified]**. | Keep LLMs out of the per-commit render path. Deterministic render from `blueprint.json` gives stable diffs. |
| dependency-cruiser + MH4GF/dependency-cruiser-report-action, delta-typescript-graph-action | PR comment with a Mermaid graph of changed files and neighbours, changed nodes highlighted. | The accepted form of "architecture diff in PRs": Mermaid in a sticky comment, scoped to the change. |
| Structurizr, IcePanel, LikeC4 | Model-as-code (C4); CI pushes or imports the model on each push to main. Version timeline/diff features not confirmed in this session. **[partly unverified]** | "Diagram follows main via CI" is standard; none overlays runtime status in a README. |
| Nx graph, Gource | Interactive local dependency graph; animated git-history video. **[unverified, general knowledge]** | Time sliders demo well; daily value comes from the PR-scoped diff. |
| Upptime | See 3.1. | The one widely used "live README" pattern: scheduled Action → JSON in repo → shields endpoint badges + marker-delimited table. |

I found no project that combines a contract-derived architecture diagram with per-component runtime status in the README.

---

## 6. Reacting to pushes: Action-only vs GitHub App/webhook vs polling

| Design | Pros | Cons |
|---|---|---|
| **Action-only** (workflow in the user's repo) | No server, no secrets beyond `GITHUB_TOKEN`, works for private repos, runs under the repo's own trust. Rassam already ships an Action. | Starts some seconds after push plus runtime; cannot notify an open browser tab; scheduled runs are loose. |
| **GitHub App + webhook** | Push delivered in seconds; one install covers many repos; 5,000+/h per installation; can post check runs and comments under its own identity. | Needs an always-on public endpoint, a private key and webhook secret, `X-Hub-Signature-256` verification over the raw body, a 10 s response deadline, no automatic redelivery of failures, out-of-order deliveries. **[community]** hookdeck guide. It is a hosted service with an operations burden. |
| **Repo webhook** (no App) | Simpler than an App. | Manual per-repo setup; same hosting burden. |
| **Polling** | No install for public repos. | 60 req/h unauthenticated per IP. With a token and `If-None-Match`, 304s are free. GitHub says prefer webhooks and honour `x-poll-interval`. **[doc]** https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api |

Updating an open canvas tab on new commits:

- Cheapest: the canvas polls the branch head (`GET /repos/{o}/{r}/commits/{branch}`) every 30–60 s with the stored ETag using the user's existing GitHub credentials, and reloads the blueprint when the SHA changes. For local-folder projects (File System Access API), poll the file's `lastModified`.
- Server-Sent Events from the Next.js app are possible (Vercel functions stream; max duration 300 s on Hobby, up to 800 s on Pro, so `EventSource` reconnects every few minutes **[doc + inference]** https://vercel.com/docs/functions/configuring-functions/duration), but SSE only helps if something pushes into the server, which means a webhook. Without the App, SSE is server-side polling with extra parts.

---

## Recommended design for Rassam

### Principles

1. The diagram is a pure function of `.rassam/blueprint.json` (+ check results) at a commit. No LLM, no timestamps in the structural output, stable ordering, so identical input gives byte-identical output.
2. Structure and liveness are separate layers with separate freshness: structure changes per commit, liveness per minute. Never commit liveness to main.
3. Action-only by default. A hosted endpoint is an optional upgrade.

### A. New engine/CLI output: `rassam render`

- `rassam render --format svg|mermaid|json [--theme light|dark] [--status <file>] [--out <path>]`, built on the existing graph (`rassam graph --format mermaid|dot|json` already exists). Renderer in `src/blueprint/` (pure string output, no DOM); file I/O in `src/cli/`.
- SVG rules for README safety: no `<script>`, no `<foreignObject>`, no external hrefs/fonts/images, system font stack, inline `<style>` only, explicit `viewBox`, target under 200 KB (far below Camo's 5 MiB), `role="img"` with `<title>`/`<desc>`.
- Emit `system-light.svg` and `system-dark.svg`; embed with `<picture>` + `prefers-color-scheme`.
- Optional status layer: a dot per component, CSS `@keyframes` pulse for "up".

### B. Blueprint additions (optional fields; a spec change that needs human approval)

```json
"runtime": {
  "environment": "production",
  "health": { "url": "https://api.example.com/healthz", "expectStatus": 200 },
  "workflow": "ci.yml"
}
```

Per component: `environment` is the GitHub environment to read deployments from; `health` is probed; `workflow` colours the node by last conclusion. Components without `runtime` render as neutral "no signal", never as "down".

Status file (written by CI or served by the endpoint):

```json
{ "schemaVersion": 1, "commit": "<sha>", "generatedAt": "<iso>",
  "components": { "api": { "state": "up|down|degraded|deploying|unknown",
    "source": "health|deployment|workflow", "checkedAt": "<iso>", "deployedSha": "<sha>" } } }
```

Draw `generatedAt` into the image ("status as of 14:05 UTC") and render `unknown` when data is older than a threshold (e.g. 30 min). A stale green dot is worse than a grey one.

### C. Per-commit sync (requirement 1)

- **Workflow `rassam-render.yml`** on `push` to the default branch, `concurrency: rassam-render`, job `permissions: contents: write` only.
- Default target: an **orphan branch `rassam-live`** holding `system-light.svg`, `system-dark.svg`, `system.mmd`, `status.json`, `badge.json` (shields endpoint format). Force-push a single commit each time, then `curl -X PURGE` the Camo URLs of the two SVGs (best effort).
- README block, written once by `rassam init` between `<!-- rassam:start -->` and `<!-- rassam:end -->`, not rewritten per commit:

```html
<!-- rassam:start -->
<a href="https://<canvas-url>/<owner>/<repo>">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<o>/<r>/rassam-live/system-dark.svg">
    <img alt="System design" src="https://raw.githubusercontent.com/<o>/<r>/rassam-live/system-light.svg">
  </picture>
</a>
<!-- rassam:end -->
```

  plus a generated legend table (component → path → environment link), which supplies the per-region links the image cannot.
- Alternative mode `--commit-to-main` for private repos or teams that want the diagram versioned with the code: write `docs/rassam/system-*.svg`, reference by relative path (no Camo; works in private repos and forks; correct on every branch and tag), commit with `[skip ci]` only when the diff is non-empty. Document that it fails on protected branches unless the bot may bypass or the workflow opens a PR.
- **PRs**: extend the existing `rassam check` Action to emit a Mermaid architecture diff (added, removed, changed components and edges) from the existing `blueprint-diff` engine, into the job summary and a sticky PR comment (`pull-requests: write`; fork PRs need the `workflow_run` split or summary-only).
- **Open canvas tab**: poll the branch head with ETag every 30–60 s and hot-reload on SHA change. Add SSE only if a GitHub App is built later.
- Expected latency push → README image: workflow start + run (about 1–2 min), visible on the next page load after purge; without purge up to about 5 more minutes (raw `max-age=300`).

### D. Liveness in the README (requirement 2)

Tier 1, Action-only (default, no server):

- Workflow `rassam-status.yml` on `schedule: '*/10 * * * *'`, `deployment_status` and `workflow_dispatch`. Reads GitHub Deployments for declared environments, probes declared health URLs from the runner, writes `status.json`, re-renders the SVGs with the status layer, force-pushes `rassam-live`, purges Camo.
- Freshness to promise: **usually within 10–20 minutes**, stated in the image footer. Scheduled workflows stop after 60 days of inactivity in public repos; document it.
- Permissions: `contents: write`, `deployments: read`. Health URLs must be public and contain no secrets.

Tier 2, hosted endpoint (optional, near-live):

- Next.js route `GET /api/live/[owner]/[repo]/system.svg?theme=dark`. Reads the blueprint at the default-branch head (cached by SHA), reads `status.json` from `rassam-live` or probes health URLs itself (from the blueprint only, SSRF-guarded, 2–3 s timeout, cached 60 s).
- Headers: `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=30`, strong `ETag`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`. On errors return a valid "status unavailable" SVG with `max-age=30`, not a 5xx (Camo would show a broken image).
- Freshness to promise: **about 1–2 minutes at page load**. Public repos only. Per-IP and per-repo rate limiting; conditional requests behind a SHA-keyed cache.
- Also `GET /api/live/[owner]/[repo]/badge.json` in shields endpoint format for a one-line badge ("architecture: passing · 7/8 up").

### E. What is impossible, and the honest fallback

| Wanted | Verdict | Fallback |
|---|---|---|
| Interactive canvas inside the README (pan, zoom, click a node) | Impossible: no JS, no iframe, inline SVG stripped, SVG-as-image has no links, `<map>` stripped | Static SVG wrapped in one link to the interactive canvas (hosted app or Pages build); legend table for per-component links |
| README that updates while the reader watches | Impossible: images load once | "Status as of HH:MM UTC" stamp in the image |
| Second-level freshness | Not achievable through Camo and browser caches | 1–2 min with the hosted endpoint; 10–20 min Action-only |
| True "is the process running" with no agent | Not knowable from the repo | Three labelled signal levels: *deployed* (GitHub Deployments), *responding* (health URL), *building* (workflow). No signal → grey "unknown" |
| Live status for private repos via a hosted image | Unsafe: Camo is anonymous and the image URL is shared with all readers | Committed relative-path SVG; status files in the same private repo, or status shown only in the authenticated canvas |
| Diagram correct on every branch/tag in orphan-branch mode | No: the URL points at one branch | `--commit-to-main` mode (relative path) |

### F. Order of work

1. `rassam render` (deterministic light/dark SVG + Mermaid) and the README block via `rassam init`.
2. `rassam-render.yml` with the orphan branch and Camo purge; Mermaid architecture diff on PRs.
3. Canvas tab polling for new commits.
4. `runtime` fields in the blueprint spec + `rassam-status.yml` (Tier 1).
5. Hosted SVG endpoint (Tier 2) only if users ask for faster freshness.

### Not verified in this session; test before committing to the design

- CSS animation and `prefers-color-scheme` inside an SVG served through Camo, in Chrome, Firefox, Safari and the GitHub mobile app.
- Whether Mermaid `click … href` works in GitHub's renderer; whether Mermaid renders in job summaries.
- Camo behaviour with `Cache-Control: no-cache` + `ETag`.
- Real delay of a `*/10` schedule on a quiet public repo.
- Whether Netlify/Fly/Render emit GitHub `deployment_status` as Vercel does.
- `rassam-live` force-push under repository rulesets that restrict branch creation.
- Pages action permissions and Pages CDN cache time.

### Side effect of this research

To confirm the PURGE mechanism I sent one `curl -X PURGE` to the Camo URL of a badge in the public upptime/upptime README. It is the request GitHub documents; its only effect is that the badge was re-fetched once.
