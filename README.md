<img src="assets/logo.svg" alt="Worried googly-eyed page holding a snapped chain link apart from two linked pages" width="160">

# ESLint Plugin Markdown Links Unlinked

[![Test](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/test.yml) [![Lint](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/lint.yml) [![Package](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/package.yml/badge.svg)](https://github.com/dblock/eslint-plugin-markdown-links-unlinked/actions/workflows/package.yml) [![Coverage](https://coveralls.io/repos/github/dblock/eslint-plugin-markdown-links-unlinked/badge.svg?branch=master)](https://coveralls.io/github/dblock/eslint-plugin-markdown-links-unlinked?branch=master)

Finds Markdown pages that nothing links to. Starting from `README.md`, the `no-unlinked-pages` rule follows your documentation's links and reports every page a reader can never reach:

```text
docs/old-guide.md
  1:1  error  This page is not linked from any root page (README.md).  markdown-links-unlinked/no-unlinked-pages
```

It complements [eslint-plugin-markdown-links](https://github.com/ota-meshi/eslint-plugin-markdown-links), whose `no-missing-path` rule checks that links point to files that exist; this plugin checks the other direction, that every page is linked from somewhere.

## Installation

Install the plugin with ESLint and `@eslint/markdown`:

```sh
npm install --save-dev eslint @eslint/markdown eslint-plugin-markdown-links-unlinked
```

Requires Node.js `^22.13.0 || >=24`, ESLint 9.39 or later (including 10), and `@eslint/markdown` 8 or 9.

## Usage

Add the `recommended` config to `eslint.config.js`:

```js
import markdown from "@eslint/markdown";
import unlinked from "eslint-plugin-markdown-links-unlinked";

export default [
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
  { files: ["**/*.md"], ...unlinked.configs.recommended },
];
```

Then run `npx eslint .` without `--cache` (see [Limitations](#limitations)).

A page counts as linked when a reachable page links to it with an inline link, a reference link, or an HTML `<a href>`, using a relative path or a path starting with `/` from the project root. A link to a directory reaches its `README.md` or `index.md`. Images, external URLs, and unused reference definitions do not count.

## Configuration

Options go in a rule override:

```js
export default [
  // ...the Usage config above
  {
    files: ["**/*.md"],
    rules: {
      "markdown-links-unlinked/no-unlinked-pages": ["error", {
        roots: ["README.md", "docs/index.md"],
        allow: ["CHANGELOG.md", "docs/drafts/**"],
      }],
    },
  },
];
```

| Option | Default | Description |
| --- | --- | --- |
| `roots` | `["README.md"]` | Pages to start from. |
| `allow` | `["CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/**"]` | Pages that may be unlinked; their own links still count. Setting it replaces the defaults. |
| `ignore` | `[]` | Pages to treat as if they did not exist: never reported, and their links do not count. |
| `extensions` | `[".md"]` | File extensions that count as pages, for example `[".md", ".mdx"]`. |
| `rootDir` | ESLint's working directory | Where to look for pages; set it to `"docs"` to check only a documentation folder. |

Patterns are globs relative to `rootDir`. If none of the `roots` exists, every page reports `No root page found: README.md.` instead.

## Limitations

- Whether a page is unlinked depends on other files, but `eslint --cache` only re-lints files that changed. Removing a link does not report the page it orphans until that page changes, so run this rule without `--cache` in CI.
- In editors, unsaved edits count immediately, while changes made outside the editor, such as a `git checkout`, count within about two seconds.
- Pages under `rootDir` that ESLint does not lint are never reported, but their links still count.
- Paths are case-sensitive, like links on GitHub, even on case-insensitive filesystems, and symbolic links are not followed.
- `node_modules` and `.git` are skipped.

## Contributing

Read [Contributing](CONTRIBUTING.md), [Design](DESIGN.md), [Changelog](CHANGELOG.md), [Releasing](RELEASING.md), and [Automated Contributor Instructions](AGENTS.md).

## License

[MIT](LICENSE).
