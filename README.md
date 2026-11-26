# ESLint Plugin Markdown Links Unlinked

[![Test](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/test.yml) [![Lint](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/lint.yml) [![Package](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/package.yml/badge.svg)](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/package.yml) [![Coverage](https://coveralls.io/repos/github/dblock/eslint-plugin-markdown-links-unlinked/badge.svg?branch=master)](https://coveralls.io/github/dblock/eslint-plugin-markdown-links-unlinked?branch=master)

An ESLint plugin that reports Markdown pages not linked from any root page, a companion to [eslint-plugin-markdown-links](https://github.com/ota-meshi/eslint-plugin-markdown-links).

## Installation

This package has not been published yet. Once released:

```sh
npm install --save-dev eslint @eslint/markdown eslint-plugin-markdown-links-unlinked
```

Requires Node.js 22.13 or a supported newer version, ESLint 9.39 or 10.x, and `@eslint/markdown` 8.x or 9.x.

## Usage

Add the plugin's `recommended` config to `eslint.config.js` for Markdown files linted with [`@eslint/markdown`](https://github.com/eslint/markdown):

```js
import markdown from "@eslint/markdown";
import unlinked from "eslint-plugin-markdown-links-unlinked";

export default [
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
  { files: ["**/*.md"], ...unlinked.configs.recommended },
];
```

The `markdown-links-unlinked/no-unlinked-pages` rule reports each linted page that cannot be reached by following local links from `README.md`:

```text
docs/old-guide.md
  1:1  error  This page is not linked from any root page (README.md).  markdown-links-unlinked/no-unlinked-pages
```

Reachability follows inline links, reference links, and HTML `<a href>` anchors, starting from the root pages. Images, unused reference definitions, and external URLs do not count. A link to a directory reaches its `README.md` and `index.md`. If no root page exists, each page reports `No root page found: README.md.` instead.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `roots` | `["README.md"]` | Globs selecting the pages reachability starts from. |
| `allow` | `["CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/**"]` | Globs for pages that are never reported; setting it replaces the defaults. |
| `ignore` | `[]` | Globs for pages left out entirely: never reported, and their links do not count. |
| `extensions` | `[".md"]` | File extensions that count as pages. |
| `rootDir` | ESLint's working directory | Directory, absolute or relative to the working directory, whose pages are checked; globs are relative to it. |

```js
import markdown from "@eslint/markdown";
import unlinked from "eslint-plugin-markdown-links-unlinked";

export default [
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
  { files: ["**/*.md"], ...unlinked.configs.recommended },
  {
    files: ["**/*.md"],
    rules: {
      "markdown-links-unlinked/no-unlinked-pages": ["error", {
        roots: ["README.md", "docs/index.md"],
        ignore: ["drafts/**"],
      }],
    },
  },
];
```

Pages are discovered under `rootDir`, skipping `node_modules` and `.git` and not following symbolic links. Path matching is case-sensitive, like links on GitHub, even on case-insensitive filesystems.

Whether a page is reachable depends on other files. With `eslint --cache`, removing a link from one page does not re-lint the page it orphans until that page changes, so run this rule without `--cache` in CI.

## Contributing

Read [Contributing](CONTRIBUTING.md), [Design](DESIGN.md), [Changelog](CHANGELOG.md), [Releasing](RELEASING.md), and [Automated Contributor Instructions](AGENTS.md).

## License

[MIT](LICENSE).
