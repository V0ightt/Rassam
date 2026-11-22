# Live system design in the README

Rassam can keep a picture of your system at the top of your README: components, their dependencies, what the blueprint check found, what the last commit changed, and (if you declare it) what is running. The picture is drawn from `.rassam/blueprint.json` and the code by fixed rules, with no model involved, and a GitHub Actions workflow republishes it on every push.

This page covers what "live" means in a README, how to set it up, how to declare runtime status, and what to do for private repositories.

## What updates, and when

| What | When it changes | How fresh it is for a reader |
| --- | --- | --- |
| Structure: components, dependencies, violations, the "changed in this commit" overlay | Every push to the default branch | The workflow takes about 1–2 minutes. GitHub then serves images from `raw.githubusercontent.com` through a cache that holds them for about 5 minutes, so allow up to about 7 minutes after a push. |
| Runtime status: up, degraded, down per component | Every 15 minutes (the `schedule` trigger), and on every push | Usually 15–25 minutes old. GitHub starts scheduled workflows late under load, and never more often than every 5 minutes. The picture carries the time of the probe ("as of 14:05 UTC"). |
| The README file itself | Only when you run `rassam render --readme` | The block is written once. It points at image URLs that stay the same, so the workflow never has to commit to your default branch. |

Rassam does not purge GitHub's image cache. A purge needs the proxied image URL of each README image, which the workflow does not know, so the cache simply expires.

GitHub disables scheduled workflows in a public repository after 60 days without repository activity. A push re-enables nothing by itself: re-enable the workflow from the Actions tab.

## What "live" can and cannot mean in a README

A README on GitHub is sanitized HTML. It can show an image; it cannot run anything.

| You might want | What is possible |
| --- | --- |
| Pan, zoom or click a component inside the README | Not possible: no scripts, no iframes, and an SVG shown as an image has no working links. The whole picture is one link (by default to the repository), and the collapsible table under it lists every component. |
| A picture that changes while the reader watches | Not possible: the image loads once per page view. The time of the status is drawn into the picture so a reader can judge its age. |
| Second-level freshness | Not possible through GitHub's image cache. Expect minutes. |
| "Is the process running right now?" | Rassam only knows what you let it probe: a health URL answered, a deployment succeeded, a workflow passed. A component without `runtime` is "not monitored", never "down". Status older than 60 minutes is drawn as "No data", because a stale green mark is worse than a grey one. |
| The correct diagram on every branch and tag | Not in the default setup: the image URL points at one branch, `rassam-live`. Use the private-repository mode below (relative paths) if you need that. |

## Set it up

1. Put the two markers where the picture should appear in `README.md`:

   ```html
   <!-- rassam:system:start -->
   <!-- rassam:system:end -->
   ```

2. Fill the block and commit the README:

   ```bash
   rassam render --readme
   ```

   This writes a `<picture>` that follows the reader's light or dark theme, two badges, a caption and a collapsible component table. The images point at `https://raw.githubusercontent.com/<owner>/<repo>/rassam-live/...`, taken from your `origin` remote. They show as broken images until the workflow has run once on the default branch.

3. Add the workflow below as `.github/workflows/rassam-live.yml` and push.

Run `rassam render --readme` again whenever you want the component table refreshed. Nothing is written when the block has not changed.

### The workflow

This repository runs [`.github/workflows/rassam-live.yml`](../.github/workflows/rassam-live.yml) on itself. For your repository, copy the version below. The only difference is the step that fetches the Rassam CLI.

```yaml
name: Rassam Live

on:
  push:
    branches: [main]
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

permissions:
  contents: write # push the rassam-live branch
  deployments: read # runtime.deployment
  actions: read # runtime.workflow

concurrency:
  group: rassam-live
  cancel-in-progress: false

jobs:
  live:
    if: github.event.repository.fork == false
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      RASSAM: node .rassam-cli/action/dist/rassam.mjs
      LIVE_BRANCH: rassam-live
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Get the Rassam CLI
        uses: actions/checkout@v4
        with:
          repository: V0ightt/Rassam
          ref: main # pin a release tag or commit SHA
          path: .rassam-cli
          sparse-checkout: action/dist
          sparse-checkout-cone-mode: false
      - name: Keep the CLI checkout out of the analysis
        run: echo ".rassam-cli/" >> .git/info/exclude
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Probe runtime status
        id: status
        continue-on-error: true
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: $RASSAM status --write --github

      - name: Fetch the published branch
        id: live
        if: github.event_name != 'schedule' || (steps.status.outputs.monitored != '' && steps.status.outputs.monitored != '0')
        run: |
          set -euo pipefail
          live="$RUNNER_TEMP/live"
          rm -rf "$live"
          mkdir -p "$live"
          if git fetch --quiet --no-tags origin "+refs/heads/$LIVE_BRANCH:refs/remotes/origin/$LIVE_BRANCH" 2> /dev/null; then
            git archive "refs/remotes/origin/$LIVE_BRANCH" | tar -x -C "$live"
          else
            echo "Branch $LIVE_BRANCH does not exist yet; it will be created."
          fi
          echo "ready=true" >> "$GITHUB_OUTPUT"

      - name: Render the system design
        if: steps.live.outputs.ready == 'true'
        run: |
          set -euo pipefail
          args=(render --out "$RUNNER_TEMP/live")
          if git rev-parse --verify --quiet "HEAD~1^{commit}" > /dev/null; then args+=(--base HEAD~1); fi
          if [ -f .rassam/status.json ]; then args+=(--stamp); fi
          $RASSAM "${args[@]}"

      - name: Publish to the live branch
        if: steps.live.outputs.ready == 'true'
        run: |
          set -euo pipefail
          live="$RUNNER_TEMP/live"
          git_dir="$(git rev-parse --absolute-git-dir)"
          export GIT_INDEX_FILE="$RUNNER_TEMP/rassam-live.index"
          rm -f "$GIT_INDEX_FILE"
          cd "$live"
          git --git-dir="$git_dir" --work-tree=. add --all .
          tree="$(git --git-dir="$git_dir" write-tree)"
          published="$(git --git-dir="$git_dir" rev-parse --verify --quiet "refs/remotes/origin/$LIVE_BRANCH^{tree}" || true)"
          if [ "$tree" = "$published" ]; then
            echo "Nothing changed; $LIVE_BRANCH is up to date."
            exit 0
          fi
          commit="$(git --git-dir="$git_dir" \
            -c user.name="github-actions[bot]" \
            -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
            commit-tree "$tree" -m "Rassam live system design for ${GITHUB_SHA::7} [skip ci]")"
          git --git-dir="$git_dir" push --force origin "$commit:refs/heads/$LIVE_BRANCH"
```

What it does, step by step:

- **Triggers.** A push to `main` redraws the structure. The 15-minute schedule exists only to refresh the status: when no component declares `runtime`, a scheduled run stops after the probe step and publishes nothing. `workflow_dispatch` lets you run it by hand. Change `branches: [main]` if your default branch has another name.
- **Never on forks.** `if: github.event.repository.fork == false` keeps a fork from publishing its own copy.
- **Probe.** `rassam status --write --github` writes `.rassam/status.json` into the runner's checkout (it is not committed). The step may fail without failing the job.
- **Render.** `rassam render --base HEAD~1` draws the design and highlights what the last commit changed. On the first commit there is nothing to compare with, so `--base` is left out. `--stamp` draws the probe time into the picture when there is a status.
- **Publish.** The output directory is committed as a single parentless commit and force-pushed to `rassam-live` with the workflow's own `GITHUB_TOKEN`. The step uses a private index and plumbing commands, so the checkout and the history of every other branch are untouched, and the branch never grows beyond one commit. When the rendered files equal what is published, nothing is pushed. Pushes made with `GITHUB_TOKEN` do not start other workflows.
- **Concurrency.** One run at a time; a second run waits instead of racing the first.

If a repository ruleset restricts who may create or force-push branches, allow GitHub Actions to do both for `rassam-live`.

### Files on the `rassam-live` branch

| File | Content |
| --- | --- |
| `system-light.svg`, `system-dark.svg` | The diagram in both themes |
| `badge-blueprint.svg` | `blueprint: passing`, `N warnings` or `failing` |
| `badge-system.svg` | `system: operational`, `degraded`, `outage`, `no data` or `not monitored` |
| `system.json` | The same information for programs: commit, time, verdict, check summary, the component graph, the status and the architecture diff. Format in the [CLI reference](blueprint-spec.md#rassam-render). |

By default the diagram is "calm": it leaves out test components, edges into components marked `public`, and declared dependencies that a longer declared path already implies, and says in a footnote how many of each it hid. Undeclared, forbidden and unobserved dependencies, and everything a commit changed, are always drawn. Pass `--detail full` to draw everything.

## Declare what is running

Status is opt-in per component. Add `runtime` to a component in `.rassam/blueprint.json`:

```json
{
  "id": "api",
  "name": "API",
  "paths": ["src/api/**"],
  "runtime": {
    "health": { "url": "https://api.example.com/healthz" },
    "deployment": { "environment": "production" },
    "workflow": { "file": "deploy.yml" }
  }
}
```

Use any one of the three, or several:

| Signal | Declares | Means |
| --- | --- | --- |
| `health` | A public `http(s)` URL, optionally `method` (`GET` or `HEAD`), `expectStatus` and `timeoutMs` | *Responding.* 2xx (or exactly `expectStatus`) is up; 5xx, a timeout or a network error is down; anything else is degraded. |
| `deployment` | The name of a GitHub deployment environment | *Deployed.* The latest deployment status: success is up, failure or error is down, in progress is degraded. Platforms such as Vercel report deployments to GitHub; check that yours does. |
| `workflow` | A workflow file name | *Building.* The latest run on the default branch: success is up, failure is down, still running is degraded. |

When a component declares several signals the worst one wins, and a signal without data never hides one that has it. Try it locally:

```bash
rassam status              # a table and an overall line
rassam status --github     # also read deployments and workflow runs (set GITHUB_TOKEN for private repositories)
rassam status --write      # save .rassam/status.json for rassam render
```

Coding agents connected through the MCP server read the same file with the `system_status` tool, and see what a change did to the design with `architecture_diff`.

### The status file

`rassam status --write` saves `.rassam/status.json`:

```json
{
  "version": 1,
  "checkedAt": "2026-05-01T14:05:09Z",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "components": {
    "api": {
      "state": "up",
      "source": "health-check",
      "detail": "HTTP 200 in 84 ms; production: success at 0123456",
      "latencyMs": 84,
      "url": "https://api.example.com/healthz",
      "checkedAt": "2026-05-01T14:05:09Z"
    }
  }
}
```

`state` is `up`, `degraded`, `down` or `unknown`. `source` is the signal that decided it: `health-check`, `deployment`, `workflow` or `manual`. You can write this file from your own monitoring instead of `rassam status`; `rassam render --status <file>` accepts any file in this format. The full field list is in the [CLI reference](blueprint-spec.md#rassam-status).

Do not commit the file from the workflow. Status changes every few minutes and belongs on `rassam-live`, where `system.json` carries it, not in the history of your default branch. Adding `.rassam/status.json` to `.gitignore` keeps a local probe out of your commits.

## Private repositories

`raw.githubusercontent.com` does not serve private repositories to a README without a token, so the default image URLs show broken images there. Use relative paths and commit the pictures next to the code:

```bash
rassam render --out .rassam/live --readme --image-base .rassam/live
git add .rassam/live README.md
git commit -m "Update the system design"
```

Relative paths work for everyone who can read the repository, in forks, and on every branch and tag, and they bypass the image cache. The cost is a commit to your default branch whenever the design changes. To automate it, replace the "Fetch" and "Publish" steps of the workflow with a render into `.rassam/live` followed by a commit when `git status --porcelain .rassam/live` is not empty, with `[skip ci]` in the message. On a protected branch that push is rejected unless GitHub Actions may bypass the protection; opening a pull request from the workflow is the alternative.

Leave the status out in this mode, or accept that every status change becomes a commit: drop the `schedule` trigger and the probe step, and the picture shows structure and violations only. Without `--stamp` the same commit always renders the same files, so the workflow commits only when the design changed.

## Security notes

- **Health URLs are fetched by your CI runner**, with the runner's network access. Declare only URLs you are content to have requested every 15 minutes from GitHub's (or your self-hosted runner's) network. On a self-hosted runner a health URL can reach internal hosts; the blueprint is reviewed in pull requests like any other file, and `runtime` changes deserve that review.
- **Do not put secrets in URLs.** The blueprint is a committed file and the status is published. `rassam status` refuses URLs that carry a user name or password, records health URLs without their query string, never reads or prints a response body, and sends no credentials to health URLs. The `GITHUB_TOKEN` is sent only to the GitHub API.
- **The published branch is as public as the repository.** `rassam-live` holds component names, the dependency graph, violation counts and status details. In a public repository anyone can read it.
- **The workflow needs `contents: write`** to push `rassam-live`. It uses the built-in `GITHUB_TOKEN`, runs no code from the pull request (it is not triggered by pull requests) and never runs on forks. Pin the Rassam CLI to a release tag or commit SHA.
- **The pictures are inert.** The SVG files contain no scripts, no external references and no embedded HTML, and all text from the blueprint is escaped.
