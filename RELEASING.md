# Maintainer Release and ClawHub Publish (internal)

Internal release guide. **Not shipped** in the published package — it is intentionally
excluded from `package.json` `files`, so it never appears on the public ClawHub listing.

This repository is the **public source of record** for the `@prolown/openclaw-surplus-intelligence` OpenClaw
plugin. The plugin lives at the repo root. Use this flow only from a clean checkout with
Node 20 or 22.

Official references:

- https://docs.openclaw.ai/clawhub/publishing
- https://docs.openclaw.ai/clawhub/cli
- https://docs.openclaw.ai/plugins/building-plugins

## Naming

- ClawHub / install name: `@prolown/openclaw-surplus-intelligence` (`openclaw plugins install clawhub:@prolown/openclaw-surplus-intelligence`)
- Repository name follows the community convention `openclaw-plugin-<name>`.
- The package name in `package.json`, the plugin `id`/`name` in `openclaw.plugin.json`, and
  `openclaw.install.clawhubSpec`/`npmSpec` must stay in sync.

## Local release gates

```bash
node --version
npm audit --omit=dev --audit-level=moderate
node --check auth.js && node --check buyer-actions.js && node --check commands.js && node --check config.js && node --check errors.js && node --check http.js && node --check index.js && node --check seller-actions.js
npm pack --dry-run --json --ignore-scripts
npx --yes @openclaw/plugin-inspector inspect --no-openclaw --out /tmp/si-plugin-inspector --json
git diff --check
```

For a release, bump the version in `package.json`, `npm-shrinkwrap.json`, and
`openclaw.plugin.json` (keep all three in sync). If dependencies changed, refresh the
shrinkwrap with `npm install --package-lock-only --ignore-scripts` and re-run the gates.

The stable `0.1.1` is published on `latest`. The current working version is a pre-release:
`0.2.0-alpha.1` (a breaking refactor: wallet flow removed, seller not implemented). Iterate
alpha builds as `0.2.0-alpha.2`, `0.2.0-alpha.3`, … (publish each on the `alpha` tag — see
Publish), then drop the suffix to cut the stable `0.2.0` on the default `latest` channel.

## Build the artifact

```bash
npm pack --ignore-scripts
```

This creates `prolown-openclaw-surplus-intelligence-<version>.tgz`. Use that `.tgz` for the ClawHub dry-run and publish.

## Source provenance

ClawHub **requires** `--source-repo` and `--source-commit` for code plugins. Because this repo
is public, the provenance link is fully verifiable. Commit and push the release revision first,
then point provenance at the pushed commit:

```bash
git push                      # ensure the release commit is on the public remote
SOURCE_REPO=https://github.com/ProlowN/openclaw-plugin-surplus-intelligence
SOURCE_COMMIT=$(git rev-parse HEAD)
# plugin lives at the repo root, so --source-path is not needed
```

## Publish

**This is a pre-release (`-alpha.N`).** Publish it on the `alpha` tag so it does **not** become
the default `latest` that `openclaw plugins install` / `npm install` resolve. Both ClawHub and
npm default to `latest`, so pass the alpha tag explicitly: ClawHub `--tags alpha` (below), and if
you also publish to npm, `npm publish --tag alpha`. When you later cut the stable `0.2.0`, drop the
tag so it publishes to `latest`.

```bash
clawhub login
clawhub whoami
clawhub package publish ./prolown-openclaw-surplus-intelligence-<version>.tgz --family code-plugin \
  --tags alpha --source-repo "$SOURCE_REPO" --source-commit "$SOURCE_COMMIT" --dry-run --json
```

If publishing under a ClawHub org owner, add `--owner <handle>` to both publish commands.

Inspect the dry-run output before uploading. It should resolve the package name, version,
source repo/commit metadata, OpenClaw compatibility metadata, and the package file list. If
anything is wrong, fix it and rebuild the `.tgz`.

Only after explicit release approval, publish the exact same artifact (drop `--dry-run`):

```bash
clawhub package publish ./prolown-openclaw-surplus-intelligence-<version>.tgz --family code-plugin \
  --tags alpha --source-repo "$SOURCE_REPO" --source-commit "$SOURCE_COMMIT" --json
```

## Verify

```bash
clawhub package inspect @prolown/openclaw-surplus-intelligence
clawhub package readiness @prolown/openclaw-surplus-intelligence
openclaw plugins install clawhub:@prolown/openclaw-surplus-intelligence
openclaw plugins inspect @prolown/openclaw-surplus-intelligence --runtime --json
```

New ClawHub releases can remain hidden from normal install and download surfaces until
automated security checks and verification finish.
