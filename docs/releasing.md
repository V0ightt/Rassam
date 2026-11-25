# Releasing

A release is one pushed tag, `vX.Y.Z`. The [Release workflow](../.github/workflows/release.yml) then:

1. **Build and verify** (read-only): checks that the tag equals `v` + the version in `packages/rassam/package.json` and `ENGINE_VERSION` in `src/blueprint/constants.ts`, that the tagged commit is on the default branch and that `docs/releases/vX.Y.Z.md` exists; runs lint, typecheck and tests; rebuilds the CLI bundle and fails if the committed `action/dist/rassam.mjs` is stale; stages and packs the package with `node scripts/pack-cli.mjs --pack …`.
2. **Publish to npm** (behind the `npm` environment): uploads that exact tarball with npm trusted publishing. There is no npm token anywhere: the job proves who it is with GitHub's OIDC token, and npm attaches a provenance statement that links the package to the workflow run.
3. **GitHub release**: creates the release for the tag with the notes from `docs/releases/vX.Y.Z.md` and attaches the npm tarball, `rassam.mjs` and a `SHA256SUMS` file.

The GitHub Action needs nothing extra: it runs the committed bundle at the tagged commit. The MCP Registry entry is a manual step after the release (see the end of this page).

Running the workflow by hand (Actions → Release → Run workflow) is a **dry run** on any branch or tag: it builds, checks and packs, and keeps the tarball, bundle and checksums as the `release` workflow artifact. It never publishes.

The package name is `PACKAGE_NAME` in `src/blueprint/constants.ts` (today `@v0ightt/rassam`; the command is always `rassam`). To rename it, change that constant, `name` in `packages/rassam/package.json`, the package `identifier` in `packages/rassam/server.json` and the commands in `packages/rassam/README.md`. `src/cli/package.test.ts` fails until they agree.

## One-time setup

### npm

1. Use the npm account that owns the scope (`v0ightt` for `@v0ightt/rassam`, or an npm organization of that name; do not convert that user into an organization) and turn on two-factor authentication. npm refuses to publish without it. npm only offers security keys, but a USB key is not needed: Windows Hello (a PIN is enough), Touch ID or a phone over Bluetooth all count. If the browser's prompt asks for a USB key, cancel it once to get the list of other options. Keep the recovery codes away from that device.
2. **Create the package with its first version by hand.** npm can only trust a workflow for a package that already exists, so the very first version cannot come from the workflow. Use the tarball the workflow built, so the GitHub release and npm serve the same bytes:
   1. Do the per-release steps below for the first version and push its tag. When the build job passes, the run waits for approval of the `npm` deployment. Leave it waiting.
   2. Download the `release` artifact from that run and publish the tarball inside it:

      ```bash
      gh run download <run id> --repo V0ightt/Rassam --name release --dir .pack/release-vX.Y.Z
      npm login
      npm publish ./.pack/release-vX.Y.Z/files/v0ightt-rassam-X.Y.Z.tgz --access public --provenance=false
      ```

      `--provenance=false` is required: the package asks for a provenance statement, which only a CI run can produce, so a publish from your machine fails without it. This version has no provenance statement; every later one has.
   3. Wait until `npm view @v0ightt/rassam@X.Y.Z dist.integrity` shows the version (npm can take several minutes), then approve the waiting deployment. The publish job sees the identical version on npm and skips it, and the GitHub release is created. Approving earlier makes the publish job try to publish itself and fail; if that happens, re-run the failed jobs once the version shows up.
3. **Add the trusted publisher shortly before the next release.** A new trusted publisher expires if no publish uses it within 2 days, so set it up when the next tag is ready. On npmjs.com, open the package → Settings → Trusted publishing → GitHub Actions, and enter exactly (every field is case-sensitive):
   - Organization or user: `V0ightt`
   - Repository: `Rassam`
   - Workflow filename: `release.yml`
   - Environment name: `npm`

   Or from a terminal (npm 11.5.1 or newer, asks for your second factor): `npm trust github @v0ightt/rassam --file release.yml --repo V0ightt/Rassam --env npm --allow-publish`
4. After the first publish through the workflow, set the package's publishing access to **require two-factor authentication and disallow tokens**. Trusted publishing keeps working; stolen tokens no longer can.

### GitHub

1. **Environment**: Settings → Environments → New environment `npm`. Add yourself as a required reviewer so every publish waits for your approval (leave "prevent self-review" off if you are the only maintainer). Under deployment branches and tags, allow only tags matching `v*.*.*`.
2. **Tag ruleset**: Settings → Rules → Rulesets → New tag ruleset targeting `v*`, restricting creation, update and deletion to repository admins. Only maintainers can then start a release.
3. **Immutable releases**: Settings → General → Releases → enable release immutability. A published release's tag and assets can then never change, so `@vX.Y.Z` always means the same code.
4. Third-party actions in `release.yml` are pinned to full commit SHAs with the version in a comment. Let Dependabot or Renovate propose updates; do not replace a pin with a tag.

## Every release

1. Pick the version (semantic versioning; a pre-release such as `0.5.0-rc.1` is published under the npm dist-tag `next` and marked as a pre-release on GitHub).
2. Bump it in every place that names it:
   - `ENGINE_VERSION` in `src/blueprint/constants.ts`
   - `version` in `packages/rassam/package.json`
   - `version` and `packages[0].version` in `packages/rassam/server.json`
   - the pins in `packages/rassam/README.md`: `@v0ightt/rassam@X.Y.Z` in the MCP snippet and `V0ightt/Rassam@vX.Y.Z` in the Action snippet

   `npx vitest run src/cli/package.test.ts` fails if one is missed.
3. Write the release notes in `docs/releases/vX.Y.Z.md` (the workflow refuses to publish without them) and update `CHANGELOG.md`.
4. Rebuild and commit the bundle, which carries the version: `npm run build:cli`. Try the package locally:

   ```bash
   npm run pack:cli -- --pack .pack/out
   tar -tzf .pack/out/v0ightt-rassam-X.Y.Z.tgz
   npx --yes ./.pack/out/v0ightt-rassam-X.Y.Z.tgz --version
   ```

   Give npx a relative path (or `npx --yes --package <absolute path> rassam …`): npm 10 treats an absolute path as a local program and silently runs nothing.
5. Merge to the default branch through a pull request, so CI and the blueprint gate run.
6. Tag the merge commit and push the tag:

   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

7. Approve the `npm` deployment when the workflow asks, and watch the run.
8. Check the result: `npx --yes @v0ightt/rassam@X.Y.Z --version`, the provenance badge on the package's npm page, and the release assets (`sha256sum -c SHA256SUMS`).

If the build job fails, nothing was published: fix the problem, delete the tag (`git push --delete origin vX.Y.Z`; possible while no release exists for it) and tag again. If publishing succeeded but the release job failed, re-run the failed jobs; the publish job skips a version that is already on npm with identical contents. A published npm version can never be reused: if one is broken, deprecate it (`npm deprecate @v0ightt/rassam@X.Y.Z "…"`) and release the next patch.

## Pinning the GitHub Action

Tell Action users to pin a release, never `@main`:

```yaml
# Strongest: the full commit SHA of the release, with the version in a comment.
- uses: V0ightt/Rassam@<40-character commit SHA> # vX.Y.Z

# Readable alternative: the release tag. With immutable releases it cannot move.
- uses: V0ightt/Rassam@vX.Y.Z
```

Find the SHA with `git ls-remote https://github.com/V0ightt/Rassam refs/tags/vX.Y.Z` (for an annotated tag, use the line ending in `^{}`, which is the commit). Dependabot and Renovate update SHA pins together with the version comment. No moving major tag (such as `v0`) is published.

## MCP Registry (manual)

The [official MCP Registry](https://registry.modelcontextprotocol.io) lists the server from `packages/rassam/server.json`. Publish it after the npm release succeeded: the registry reads `mcpName` from the published npm package to prove the package is yours.

1. Install `mcp-publisher` from the [registry's releases](https://github.com/modelcontextprotocol/registry/releases), pinned to a version, as its [documentation](https://github.com/modelcontextprotocol/registry/tree/main/docs) describes.
2. From `packages/rassam/`, log in with the GitHub account that owns the repository and publish:

   ```bash
   cd packages/rassam
   mcp-publisher login github
   mcp-publisher publish
   ```

3. Check it: `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.V0ightt/rassam"`.

The server name must start with `io.github.` followed by the GitHub login exactly as GitHub spells it (`V0ightt`): the registry compares it case-sensitively. To automate this later, add a job to `release.yml` after `publish` with `id-token: write` that runs `mcp-publisher login github-oidc` and `mcp-publisher publish`.
