# Design

This plugin finds Markdown pages that readers cannot reach by following links from a project's root pages. It complements [eslint-plugin-markdown-links](https://github.com/ota-meshi/eslint-plugin-markdown-links), which checks that outgoing links resolve; this plugin checks the opposite direction, that every page has an incoming path from a root.

The scaffold exports the plugin and an empty `recommended` config. The rule below is the agreed first-version design and is not implemented yet.

## Rule

`markdown-links-unlinked/no-unlinked-pages` reports a linted Markdown file that is not reachable from any root page. It reports once per file at line 1, for example `This page is not linked from any root page (README.md).`, listing the configured roots. If no root page exists, it reports a configuration problem at line 1 instead, for example `No root page found: README.md.`

| Option | Default | Purpose |
| --- | --- | --- |
| `roots` | `["README.md"]` | Globs selecting the pages where reachability starts. |
| `allow` | `["CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/**"]` | Pages that are never reported. |
| `ignore` | `[]` | Globs excluded from discovery entirely. |
| `extensions` | `[".md"]` | File extensions that count as pages. |
| `rootDir` | ESLint's current working directory | Base directory for discovery and globs. |

## Link Graph

ESLint does not give rules the list of linted files, so the rule discovers pages itself: it globs files with the configured extensions under `rootDir`, skipping `node_modules`, `.git`, and `ignore` patterns. Each page is parsed with `mdast-util-from-markdown` and the GFM extensions, the same parser family `@eslint/markdown` uses, rather than private ESLint internals.

Edges come from inline links, reference definitions, and HTML `<a href>` anchors. Targets resolve relative to the linking page; `/path` resolves from `rootDir`. Fragments and queries are removed and percent-encoding and angle-bracket destinations are decoded. A link to a directory reaches its `README.md` or `index.md`. External URLs, images, non-page files, and targets outside `rootDir` add no edges. Reachability is a breadth-first search from the roots, so link cycles terminate.

The graph is built once and reused while discovered pages are unchanged; any added, removed, or modified page (by modification time and size) rebuilds it. This keeps a full run linear in the size of the documentation and keeps editor sessions current.

## Limitations

Whether a page is reachable depends on other files. With `eslint --cache`, removing a link from one page does not re-lint the newly unlinked page until that page changes, so CI should run without `--cache`. Pages ESLint does not lint are never reported, although their links still count. Path comparison follows the case sensitivity of the filesystem.

## Out of Scope

The first version does not report links to missing files or fragments (use `markdown-links/no-missing-path` and `markdown/no-missing-link-fragments`), unused images or other assets, or pages reachable only through site navigation such as a VitePress sidebar.
