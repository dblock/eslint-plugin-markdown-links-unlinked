# Contributing

Read [Design](DESIGN.md) and [Automated Contributor Instructions](AGENTS.md) first.

## Setup and Validation

Use Node.js `26.13.0` from `.nvmrc` for development and npm. The package supports Node.js `^22.13.0 || >=24.0.0`, ESLint `^9.39.0 || ^10.0.0`, and `@eslint/markdown` `^8.0.0 || ^9.0.0`. Documentation spelling tools require Node.js 22.18 on the 22.x line or Node.js 24 or later. Verify and prefer current stable releases when selecting or updating dependencies while preserving supported-runtime compatibility.

```sh
npm ci
npm test
npm run lint
npm run test:coverage
npm run package:check
```

Run `npm test` and `npm run lint` before every push, including updates to a PR. Run final checks before committing and reuse their results for the push when tested content and configuration have not changed. `npm test` includes the packed-consumer test; `npm run package:check` runs it alone. `PACKAGE_ARCHIVE` selects an existing archive for that test; an unset or empty value packs a fresh one.

`npm run lint:code` checks source and embedded JavaScript examples. `npm run lint:markdown` uses ESLint for Markdown structure, prose, spelling, single-line paragraphs, and title-case headings, combining `@eslint/markdown`, `eslint-plugin-markdown-preferences`, `eslint-plugin-markdown-preferences-paragraph` with `width: "nowrap"`, and `eslint-plugin-prose-spellcheck` with US English, software terminology, and `.spellcheck.txt`. Local rules in `scripts/documentation-plugin.js` require a first-level first heading and a final newline. The documentation lint also runs this plugin's `no-unlinked-pages` rule, so link new root documents from README. `npm run lint:workflows` checks title case for workflow, job, and step display names.

Development uses `@eslint/markdown` 9. The root `overrides` let the development-only documentation plugins, whose released peer ranges do not include 9 yet, share it; they never reach consumers. Remove each override once that plugin's peer range includes 9, and never override this plugin's own peers.

Keep human-readable Markdown headings and YAML display names in title case, preserving proper names, acronyms, and code identifiers. Keep each Markdown paragraph on one source line. Add reviewed vocabulary to `.spellcheck.txt` and fix typos instead of suppressing them.

Test, Lint, and Package are separate CI workflows. The Test matrix uses explicit inline `matrix.entry` records, without `include` or `exclude`, pairing the minimum and current Node versions with both ESLint majors and both `@eslint/markdown` majors; a Coverage job reports to Coveralls. Package validates the packed consumer on Linux, macOS, and Windows. No Danger checks are configured.

## Tests

Tests use `node --test` under `test/`. `test/plugin.test.js` covers the public export, `test/rule.test.js` lints the fixture trees in `test/fixtures/` (`links`, `defaults`, `options`, `missing-root`) with the real ESLint API through `test-support/lint.js` and runs `RuleTester`, `test/graph.test.js` covers link extraction, target resolution, discovery, permissions, and cache invalidation in temporary trees, `test/package.test.js` packs the archive, inspects its contents, installs it in a temporary consumer, and runs the real ESLint CLI, and `test/workflow-names.test.js` covers the display-name checker. Aim for coverage close to 100% of project-owned runtime code with meaningful behavioral tests, including errors and edge cases, and inspect `npm run test:coverage` output rather than excluding real code.

## Pull Requests

Start changes on a `<username>/<topic>` branch in the existing checkout, for example `git switch -c dblock/topic master`; use a sibling worktree only for work that runs in parallel. Split larger work into small stacked PRs, each branching from and targeting the PR below it. Keep each PR to one coherent commit relative to its base, and merge PRs with rebase merges only. Amend task-owned branches and push them with `--force-with-lease`; never force-push `master`.

Update affected documentation. Add CHANGELOG entries for features, improvements, and fixes, but not minor typos or the initial scaffold, as `- [#123](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/pull/123): Description - [@dblock](https://github.com/dblock).` above `- Your contribution here.` in the Next section. Features increment the minor version (resetting patch for `0.x`); ask before a major bump. Keep `package.json` and `package-lock.json` synchronized.

Include your tool's AI co-author trailer in AI-assisted commits, and disclose AI authorship on behalf of `@dblock` in PR descriptions and comments. Use closing issue references. Do not merge, publish, or tag without explicit authorization; see [Releasing](RELEASING.md).

After a PR merges, fetch with pruning, verify the merge on GitHub, and remove only clean, no-longer-needed topic branches and worktrees.
