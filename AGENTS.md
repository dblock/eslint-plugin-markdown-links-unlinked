# Working on ESLint Plugin Markdown Links Unlinked

Read [Contributing](CONTRIBUTING.md) and [Design](DESIGN.md) before changing code.

## Scope and Invariants

The plugin provides `markdown-links-unlinked/no-unlinked-pages`, which reports Markdown pages not reachable by following local links from root pages. It does not check missing link targets or fragments, unused assets, or site-navigation configs; those belong to other plugins or are non-goals. The `recommended` config enables it as an error.

The entry point is `src/index.js`, the rule is `src/rules/no-unlinked-pages.js`, discovery and the cached link graph are `src/graph.js`, and link extraction is `src/links.js`. Tests are in `test/`, fixture trees in `test/fixtures/`, and shared helpers in `test-support/`. Invariants:

- Use public ESLint, `@eslint/markdown`, and mdast APIs only: no private ESLint internals, upstream internal imports, or global dependency mutation.
- Discovery is read-only, and diagnostics are deterministic regardless of filesystem order.
- Parse links with a Markdown parser, not ad hoc regular expressions over whole documents.
- Edges come only from links a reader can follow (inline links, resolved link references, HTML `<a href>`); images, unused definitions, and front matter never count.
- Path matching is case-sensitive, and symbolic links are not followed.
- Build the cross-file graph once per process, keyed by root directory and options; update it from each linted page's `sourceCode.text` with the plugin's own parser, never from ESLint's language-dependent tree; and sweep for outside changes at most every `SWEEP_INTERVAL`, parsing only changed pages. Do not stat every page for each linted file.
- Documentation lint dogfoods the rule, so every root document must stay linked from README.

## Setup and Validation

Use Node.js `26.13.0` from `.nvmrc`. The package supports Node.js `^22.13.0 || >=24.0.0`, ESLint `^9.39.0 || ^10.0.0`, and `@eslint/markdown` `^8.0.0 || ^9.0.0`. Development uses `@eslint/markdown` 9 with root `overrides` only for development documentation plugins whose peers lack 9; remove each once its peer range includes 9 and never override this plugin's own peers. Verify current stable releases when updating dependencies.

Run `npm ci`, `npm test`, `npm run lint`, and `npm run package:check` (already included in `npm test`) before every commit and push; use `npm run test:coverage` for coverage and aim close to 100% of runtime code with meaningful tests. Validate the real `npm pack` archive in a temporary consumer when packaging or exports change; `PACKAGE_ARCHIVE` selects an existing archive and an empty value means fresh packing.

Benchmarks live in `bench/`: `npm run bench` (100, 1,000, and 5,000 pages) and `npm run bench:quick`, which the Test workflow's Benchmarks job runs without thresholds. Keep them working when internals change, and report measured before-and-after medians from the same machine and command for performance changes.

Keep Test, Lint, and Package workflows separate, with explicit inline `matrix.entry` records and no `include` or `exclude`, and keep Coveralls coverage. `npm run lint` covers source, embedded JavaScript, Markdown structure, prose, spelling, single-line paragraphs, title-case headings, and workflow display names. Each workflow's `concurrency` group cancels superseded pull request runs but never `master` runs.

## Documentation and Versions

Keep Markdown paragraphs on one source line, headings and YAML display names in title case, and reviewed vocabulary in `.spellcheck.txt`. Add CHANGELOG entries with the actual PR number for features, improvements, and fixes. Features increment the minor version (resetting patch for `0.x`); ask before a major bump. Keep `package.json` and `package-lock.json` synchronized.

## Git and Pull Requests

Work on `<username>/<topic>` branches in the existing checkout and use sibling worktrees only for parallel work. Stack dependent PRs, keep one coherent commit per PR, merge with rebase merges only, and push amended task branches with `--force-with-lease`; never force-push `master`. Include your tool's AI co-author trailer in AI-assisted commits and disclose AI authorship on behalf of `@dblock` in PRs and comments. Do not merge, publish, tag, create releases, or configure credentials without explicit authorization; see [Releasing](RELEASING.md).
