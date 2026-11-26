# Design

This plugin finds Markdown pages that readers cannot reach by following links from a project's root pages. It complements [eslint-plugin-markdown-links](https://github.com/ota-meshi/eslint-plugin-markdown-links), which checks that outgoing links resolve; this plugin checks the opposite direction, that every page has an incoming path from a root.

The plugin exports one rule, `no-unlinked-pages`, enabled as an error by the `recommended` config. The entry point is `src/index.js`, the rule is `src/rules/no-unlinked-pages.js`, discovery and the link graph are `src/graph.js`, and link extraction is `src/links.js`.

## Rule

`markdown-links-unlinked/no-unlinked-pages` reports a linted Markdown file that is not reachable from any root page. It reports once per file at line 1, for example `This page is not linked from any root page (README.md).`, listing the configured roots. If no root page exists, it reports a configuration problem at line 1 instead, for example `No root page found: README.md.` Pages outside `rootDir`, ignored pages, allowed pages, and files without a discovered page on disk, such as unsaved editor buffers, are not reported. Setting `allow` replaces its defaults, and a relative `rootDir` resolves from ESLint's working directory.

| Option | Default | Purpose |
| --- | --- | --- |
| `roots` | `["README.md"]` | Globs selecting the pages where reachability starts. |
| `allow` | `["CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/**"]` | Pages that are never reported. |
| `ignore` | `[]` | Globs excluded from discovery entirely. |
| `extensions` | `[".md"]` | File extensions that count as pages. |
| `rootDir` | ESLint's current working directory | Base directory for discovery and globs. |

## Link Graph

ESLint does not give rules the list of linted files, so the rule discovers pages itself. It walks `rootDir` with `node:fs`, skipping `node_modules`, `.git`, symbolic links, and `ignore` patterns, and keeps files ending in one of the `extensions`. A glob library would hide the walked directories, which the cache needs; [picomatch](https://github.com/micromatch/picomatch) matches `roots`, `allow`, and `ignore` with dotfiles included.

Each reachable page is read from disk and parsed with [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown) with the GFM and YAML/TOML front matter extensions, the parser family `@eslint/markdown` uses, rather than private ESLint internals. A page's reachability never depends on its own links, so reading pages from disk gives the right answer for the linted file even when an editor buffer is unsaved.

Edges come from what a reader can follow: inline links (including links inside GFM footnotes), link references that resolve to a definition, and HTML `<a href>` anchors, parsed from `html` nodes with [htmlparser2](https://github.com/fb55/htmlparser2) so quoting and character references are handled correctly. Images, image references, unused definitions, and front matter add no edges.

Targets resolve relative to the linking page; `/path` resolves from `rootDir`. Fragments and queries are removed, percent-encoding is decoded (falling back to the raw path when malformed), and angle-bracket destinations are unwrapped by the parser. A link to a directory, with or without a trailing slash, reaches its `README` and `index` pages with any configured extension. URLs with a scheme or starting with `//`, non-page files, and targets outside `rootDir` add no edges. Reachability is a breadth-first search from the roots, so link cycles terminate.

Graphs are cached per process by `rootDir`, `roots`, `ignore`, and `extensions`. Each cached graph records the modification time and size of every walked directory and discovered page; before reuse, the rule stats them and rebuilds when any differs. Adding, removing, or renaming a page changes its directory's modification time, and editing a page changes its own, so a full run walks the tree once while editor sessions stay current.

## Limitations

Whether a page is reachable depends on other files. With `eslint --cache`, removing a link from one page does not re-lint the newly unlinked page until that page changes, so CI should run without `--cache`. Pages ESLint does not lint are never reported, although their links still count. Path comparison is case-sensitive, matching how GitHub resolves links, so a link that only works on a case-insensitive filesystem does not count. Symbolic links are not followed, so pages reached only through them are not discovered.

## Out of Scope

The first version does not report links to missing files or fragments (use `markdown-links/no-missing-path` and `markdown/no-missing-link-fragments`), unused images or other assets, or pages reachable only through site navigation such as a VitePress sidebar.
