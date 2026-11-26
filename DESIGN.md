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

ESLint does not give rules the list of linted files, so the rule discovers pages itself. It walks `rootDir` with `node:fs`, skipping `node_modules`, `.git`, symbolic links, and `ignore` patterns, and keeps files ending in one of the `extensions`. A glob library would add little over this walk, which also records each page's modification time and size; [picomatch](https://github.com/micromatch/picomatch) matches `roots`, `allow`, and `ignore` with dotfiles included.

Each page is parsed with [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown) with the GFM and YAML/TOML front matter extensions, the parser family `@eslint/markdown` uses, rather than private ESLint internals. The linted page is parsed from `context.sourceCode.text` instead of from disk, so unsaved editor text counts. The rule parses that text itself rather than reusing ESLint's tree because one graph serves every linted file, and ESLint's tree depends on the configured language and front matter options: `markdown/commonmark` has no GFM footnotes, and front matter parses as Markdown unless enabled. A page's reachability never depends on its own links, so the linted page's text only affects other pages.

Edges come from what a reader can follow: inline links (including links inside GFM footnotes), link references that resolve to a definition, and HTML `<a href>` anchors, parsed from `html` nodes with [htmlparser2](https://github.com/fb55/htmlparser2) so quoting and character references are handled correctly. Images, image references, unused definitions, and front matter add no edges.

Targets resolve relative to the linking page; `/path` resolves from `rootDir`. Fragments and queries are removed, percent-encoding is decoded (falling back to the raw path when malformed), and angle-bracket destinations are unwrapped by the parser. A link to a directory, with or without a trailing slash, reaches its `README` and `index` pages with any configured extension. URLs with a scheme or starting with `//`, non-page files, and targets outside `rootDir` add no edges. Reachability is a breadth-first search from the roots, so link cycles terminate.

ESLint has no hook that runs after the last file, and a rule can only report on the file being linted, so the rule cannot collect links while ESLint visits pages and report orphans at the end. It needs the whole graph before the first report. The graph is therefore built once per process, keyed by `rootDir`, `roots`, `ignore`, and `extensions`, by walking and parsing every page, and kept in memory with each page's modification time, size, and link destinations. Each linted page then replaces its own links from its current text, adding itself when it is on disk but appeared since the last sweep, and reachability is recomputed only when some page's links change. Changes made outside ESLint, such as a `git checkout` or files created in a terminal, are found by a sweep that walks the tree again, drops removed pages, and parses only pages that are new or whose modification time or size changed. Sweeps run at most every two seconds (`SWEEP_INTERVAL`), so a full run walks the tree about once while long-running processes such as editor servers pick up outside changes within seconds. Linted text that differs from disk keeps counting until that file changes on disk or the process restarts.

## Limitations

Whether a page is reachable depends on other files. With `eslint --cache`, removing a link from one page does not re-lint the newly unlinked page until that page changes, so CI should run without `--cache`. In long-running processes, changes made outside ESLint count after the next sweep, within about two seconds. Pages ESLint does not lint are never reported, although their links still count. Path comparison is case-sensitive, matching how GitHub resolves links, so a link that only works on a case-insensitive filesystem does not count. Symbolic links are not followed, so pages reached only through them are not discovered.

## Out of Scope

The first version does not report links to missing files or fragments (use `markdown-links/no-missing-path` and `markdown/no-missing-link-fragments`), unused images or other assets, or pages reachable only through site navigation such as a VitePress sidebar.
