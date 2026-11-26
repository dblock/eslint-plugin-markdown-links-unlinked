# Design

This plugin finds Markdown pages that readers cannot reach by following links from a project's root pages. It complements [eslint-plugin-markdown-links](https://github.com/ota-meshi/eslint-plugin-markdown-links), which checks that outgoing links resolve; this plugin checks the opposite direction. User-facing behavior, options, and limitations are documented in the [README](README.md).

The plugin exports one rule, `no-unlinked-pages`, enabled as an error by the `recommended` config. The entry point is `src/index.js`, the rule is `src/rules/no-unlinked-pages.js`, discovery and the link graph are `src/graph.js`, and link extraction is `src/links.js`.

## Rule

The rule reports once per unreachable linted page, at line 1, listing the configured roots, or a configuration problem at line 1 when no root page exists. Allowed pages stay in the graph, so their links count, while ignored pages are never discovered. Pages outside `rootDir` and files without a discovered page on disk, such as unsaved editor buffers, are not reported. A relative `rootDir` resolves from ESLint's working directory.

## Link Graph

ESLint does not give rules the list of linted files, so the rule discovers pages itself by walking `rootDir` with `node:fs`, skipping `node_modules`, `.git`, symbolic links, and `ignore` patterns. A glob library would add little over this walk, which also records each page's modification time and size; [picomatch](https://github.com/micromatch/picomatch) matches `roots`, `allow`, and `ignore`, including dotfiles.

Pages are parsed with [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown) and the GFM and YAML/TOML front matter extensions, the parser family `@eslint/markdown` uses, rather than private ESLint internals. The rule parses the linted page's `context.sourceCode.text` itself instead of reusing ESLint's tree, because one graph serves every linted file and ESLint's tree depends on the configured language: `markdown/commonmark` has no GFM footnotes, and front matter parses as Markdown unless enabled. A page's reachability never depends on its own links, so the linted page's text only affects other pages.

Edges come from what a reader can follow: inline links (including inside GFM footnotes), link references that resolve to a definition, and HTML `<a href>` anchors, parsed with [htmlparser2](https://github.com/fb55/htmlparser2) so quoting and character references are handled correctly. Targets resolve relative to the linking page, or from `rootDir` for `/path`; fragments and queries are removed and percent-encoding is decoded, falling back to the raw path when malformed. A directory link reaches its `README` and `index` pages with any configured extension. URLs with a scheme or starting with `//`, non-page files, and targets outside `rootDir` add no edges. Reachability is a breadth-first search from the roots, so cycles terminate.

## Caching

ESLint has no hook that runs after the last file, and a rule can only report on the file being linted, so the rule cannot collect links as ESLint visits pages and report orphans at the end; it needs the whole graph before the first report. The graph is therefore kept in memory per process:

- It is built once, keyed by `rootDir`, `roots`, `ignore`, and `extensions`, by walking and parsing every page.
- Each linted page replaces its own links from its current text, so unsaved editor text counts immediately. A SHA-256 digest of the parsed text skips parsing again when the text matches what was last read, which removes a second parse of every page in a CLI run.
- Each page caches the pages its links resolve to, tagged with a version of the page set, so after one page's links change only that page's links resolve again. Reachability is recomputed only when some page's links change.
- A sweep finds changes made outside ESLint, such as a `git checkout`: it walks the tree again, drops removed pages, and parses only new pages or pages whose modification time or size changed and whose digest differs. Sweeps run at most every two seconds (`SWEEP_INTERVAL`), so a CLI run walks the tree about once and editor servers pick up outside changes within seconds.
- Linted text that differs from disk keeps counting until that file changes on disk or the process restarts.

## Benchmarks

Benchmarks use [tinybench](https://github.com/tinylibs/tinybench), a maintained MIT library with no dependencies, for consistent warmup, sampling, and statistics. They generate deterministic trees with a seeded generator instead of committing large fixtures, time phases through the graph module's internal functions (`getPageGraph`, `buildGraph`, `setClock`), and run ESLint through the public plugin entry. They report rather than assert timings, because runners vary.

The rule's remaining cost is roughly one Markdown parse per page. A parser with only the GFM footnote extension measured about 42% faster but is not equivalent: without the table and task list extensions, a `|` in a link destination inside a table cell and a `[x]` task marker with a matching `[x]:` definition produce different edges, so the rule keeps the parser `@eslint/markdown` uses.

## Out of Scope

The plugin does not report links to missing files or fragments (use `markdown-links/no-missing-path` and `markdown/no-missing-link-fragments`), unused images or other assets, or pages reachable only through site navigation such as a VitePress sidebar.

## Logo

[`assets/logo.svg`](assets/logo.svg) is original artwork created with Claude under the project's [MIT license](LICENSE), with no adapted third-party assets. The SVG is both the editable source and README display asset: a worried amber page holding a snapped chain link apart from two linked pale blue pages, on a transparent 256-by-256 canvas.

Keep the logo above the README title at 160 pixels, with descriptive alternative text. Edit the SVG directly and preserve its view box, accessible title and description, and transparent background. Inspect full-size and README-size rendering on light and dark backgrounds, for example with `rsvg-convert -w 160 assets/logo.svg`; keep previews outside the repository. The packed-consumer test verifies that the logo is included in the archive.
