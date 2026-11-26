# Releasing

Releases are published by GitHub Actions through npm Trusted Publishing, using [npm-package-release](https://github.com/dblock/npm-package-release) `0.4.0` (the exact development dependency) and its reusable workflow at the matching `v0.4.0` tag, called from [`.github/workflows/release.yml`](.github/workflows/release.yml). No npm token is stored anywhere. Publication, tags, GitHub Releases, authentication, trusted-publisher setup, and repository protection changes each require explicit authorization; this document does not grant it.

## Setup Once

### Create the Release Environment

The workflow publishes from a `release` environment that only the default branch can deploy to. Create it, restrict it to `master`, and read both settings back:

```sh
gh api -X PUT repos/dblock/eslint-plugin-markdown-links-unlinked/environments/release \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/dblock/eslint-plugin-markdown-links-unlinked/environments/release/deployment-branch-policies \
  -f name=master -f type=branch
gh api repos/dblock/eslint-plugin-markdown-links-unlinked/environments/release --jq .deployment_branch_policy
gh api repos/dblock/eslint-plugin-markdown-links-unlinked/environments/release/deployment-branch-policies --jq '.branch_policies[] | {name, type}'
```

### Allow Release Pushes

The workflow pushes the release commit and tag, and then the next development version, directly to `master`. Remove the `pull_request` rule from the default-branch ruleset, keeping the `non_fast_forward` and `deletion` rules and no bypass actors, then read the ruleset back:

```sh
id=$(gh api repos/dblock/eslint-plugin-markdown-links-unlinked/rulesets --jq '.[] | select(.target == "branch") | .id')
gh api repos/dblock/eslint-plugin-markdown-links-unlinked/rulesets/$id --jq '{name, target, enforcement, bypass_actors, conditions, rules: [.rules[] | select(.type != "pull_request")]}' > ruleset.json
gh api -X PUT repos/dblock/eslint-plugin-markdown-links-unlinked/rulesets/$id --input ruleset.json
gh api repos/dblock/eslint-plugin-markdown-links-unlinked/rulesets/$id --jq '{enforcement, bypass_actors, rules: [.rules[].type]}'
rm ruleset.json
```

This lets every writer push fast-forward commits to `master`, not only the workflow. Ordinary development still goes through pull requests.

### Reserve the Name and Trust the Workflow

npm accepts a trusted publisher only for an existing package, so `npr bootstrap` publishes a deprecated, empty `0.0.0` placeholder to reserve the name, then configures GitHub Actions publishing for `release.yml` in the `release` environment. Preview it, log in, and complete the npm 2FA prompts yourself in your own terminal:

```sh
npm exec --offline -- npr bootstrap --dry-run
npm login --registry=https://registry.npmjs.org
npm exec --offline -- npr bootstrap
npm view eslint-plugin-markdown-links-unlinked versions --json --registry=https://registry.npmjs.org
npm trust list eslint-plugin-markdown-links-unlinked --json --registry=https://registry.npmjs.org
```

`npr reserve` and `npr trust` run the two steps separately; rerun `npr trust` if it fails after the placeholder is published. Check that the publisher lists owner `dblock`, repository `eslint-plugin-markdown-links-unlinked`, workflow `release.yml`, environment `release`, and direct publishing. A new trusted publisher must publish successfully within two days, so set it up only when ready to release. Do not tag or create a GitHub Release for the placeholder.

## Releasing a Version

Make sure `## X.Y.Z (Next)` in [CHANGELOG](CHANGELOG.md) has real entries, that `package.json` and `package-lock.json` carry that unpublished version, and that CI passes on `master`. With authorization, dispatch the workflow from `master`:

```sh
gh workflow run release.yml --repo dblock/eslint-plugin-markdown-links-unlinked --ref master
gh run list --repo dblock/eslint-plugin-markdown-links-unlinked --workflow release.yml --limit 5
```

The workflow validates tests, lint, and the exact packed archive in a consumer (`npm run package:check` with `PACKAGE_ARCHIVE`), uploads recovery artifacts, publishes that archive, pushes the dated release commit and `vX.Y.Z` tag, creates the GitHub Release with the archive and changelog notes, and pushes the next patch version with a new `(Next)` section. Pass `-f version=X.Y.Z` to release a different numeric version than the checked-in one.

## Verifying a Release

A dispatch is not proof of publication. Check the run summary, the tag and GitHub Release, and that the registry's checksums match the retained archive:

```sh
npm view eslint-plugin-markdown-links-unlinked@X.Y.Z version dist.integrity dist.shasum --json --registry=https://registry.npmjs.org
gh release view vX.Y.Z --repo dblock/eslint-plugin-markdown-links-unlinked
```

## Recovery

Never overwrite a published version or move a release tag. Before retrying a failed or ambiguous run, download its retained artifacts and inspect the registry, remote tags, and GitHub Release, following npm-package-release's [recovery guide](https://github.com/dblock/npm-package-release/blob/v0.4.0/docs/recovery.md); a retry reconciles completed steps rather than repeating publication.

## Testing the Release Configuration

[`npr.config.js`](npr.config.js) exports `createReleaseWorkflow`, and `test/release.test.js` runs it with npm-package-release's simulated registry and release host against a local Git remote, without publishing. It skips below npm-package-release's Node.js minimum without raising the plugin's own. Do not use `npr prepare` or `npr release` as a preview in a real checkout: they commit and tag, and `release` publishes and pushes.
