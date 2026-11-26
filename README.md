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

Usage is not implemented yet. The planned `markdown-links-unlinked/no-unlinked-pages` rule will report Markdown files that cannot be reached by following local links from root pages such as `README.md`; see [Design](DESIGN.md).

## Contributing

Read [Contributing](CONTRIBUTING.md), [Design](DESIGN.md), [Changelog](CHANGELOG.md), [Releasing](RELEASING.md), and [Automated Contributor Instructions](AGENTS.md).

## License

[MIT](LICENSE).
