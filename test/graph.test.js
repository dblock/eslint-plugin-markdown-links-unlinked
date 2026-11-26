import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { clearPageGraphCache, getPageGraph, resolveTargets, setClock, SWEEP_INTERVAL } from "../src/graph.js";
import { extractLinks } from "../src/links.js";

const options = { roots: ["README.md"], ignore: [], extensions: [".md"] };
const posixOnly = process.platform === "win32" || process.getuid?.() === 0
  ? "requires POSIX permissions as a non-root user"
  : false;

async function tree(files) {
  const directory = await mkdtemp(join(tmpdir(), "markdown-links-unlinked-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(directory, path, ".."), { recursive: true });
    await writeFile(join(directory, path), text);
  }
  return directory;
}

test("extracts inline, reference, and HTML links but not images or unused definitions", () => {
  assert.deepEqual(extractLinks([
    "[a](a.md) ![i](i.md) [r][x] ![ir][y] <a href='h.md'>h</a> <a>none</a>",
    "",
    "[x]: r.md",
    "[x]: duplicate.md",
    "[y]: image.md",
    "[z]: unused.md",
  ].join("\n")), ["a.md", "r.md", "h.md"]);
});

test("resolves destinations against the linking page", () => {
  const pages = new Set(["README.md", "a.md", "docs/README.md", "docs/index.md", "docs/b.md"]);
  const resolve = (page, destination) => resolveTargets(page, destination, pages, [".md"]);
  assert.deepEqual(resolve("docs/b.md", "../a.md#top"), ["a.md"]);
  assert.deepEqual(resolve("docs/b.md", "/a.md"), ["a.md"]);
  assert.deepEqual(resolve("docs/b.md", "."), ["docs/README.md", "docs/index.md"]);
  assert.deepEqual(resolve("docs/b.md", "/"), ["README.md"]);
  assert.deepEqual(resolve("a.md", "docs//"), ["docs/README.md", "docs/index.md"]);
  assert.deepEqual(resolve("a.md", "/../a.md"), []);
  assert.deepEqual(resolve("a.md", "?query"), []);
  assert.deepEqual(resolve("a.md", "HTTPS://example.com/a.md"), []);
  assert.deepEqual(resolve("a.md", "missing.md"), []);
});

test("skips node_modules and .git and does not follow symbolic links", { skip: process.platform === "win32" && "symbolic links need privileges on Windows" }, async () => {
  const directory = await tree({
    "README.md": "[a](node_modules/a.md) [b](.git/b.md) [c](linked/c.md) [d](d.md)",
    "node_modules/a.md": "# A",
    ".git/b.md": "# B",
    "target/c.md": "# C",
    "real.md": "# Real",
  });
  try {
    await symlink(join(directory, "target"), join(directory, "linked"));
    await symlink(join(directory, "real.md"), join(directory, "d.md"));
    const graph = getPageGraph(directory, options);
    assert.deepEqual([...graph.pages].sort(), ["README.md", "real.md", "target/c.md"]);
    assert.deepEqual([...graph.reachable], ["README.md"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/** Runs a test body with a manual clock and a fresh graph cache. */
async function withClock(body) {
  let time = 0;
  const restore = setClock(() => time);
  clearPageGraphCache();
  try {
    await body({ advance: (milliseconds = SWEEP_INTERVAL) => { time += milliseconds; } });
  } finally {
    restore();
    clearPageGraphCache();
  }
}

const unreachable = (graph) => [...graph.pages].filter((page) => !graph.reachable.has(page)).sort();

test("sweeps for outside changes at most once per interval", () => withClock(async ({ advance }) => {
  const directory = await tree({ "README.md": "# Root\n", "a.md": "# A\n" });
  try {
    const graph = getPageGraph(directory, options);
    assert.deepEqual(unreachable(graph), ["a.md"]);
    assert.notEqual(getPageGraph(directory, { ...options, ignore: ["x"] }), graph, "Options are part of the key.");

    await writeFile(join(directory, "README.md"), "# Root\n\n[A](a.md)\n");
    await writeFile(join(directory, "b.md"), "# B\n");
    advance(SWEEP_INTERVAL - 1);
    assert.equal(getPageGraph(directory, options), graph, "Changes wait for the next sweep.");

    advance(1);
    const swept = getPageGraph(directory, options);
    assert.deepEqual(unreachable(swept), ["b.md"], "A modified page is parsed again and an added page is found.");

    advance();
    assert.equal(getPageGraph(directory, options), swept, "A sweep without changes keeps the graph.");

    await mkdir(join(directory, "docs"));
    await writeFile(join(directory, "docs/c.md"), "# C\n");
    await writeFile(join(directory, "a.md"), "# A\n\n[B](b.md)\n");
    advance();
    assert.deepEqual(unreachable(getPageGraph(directory, options)), ["docs/c.md"], "Pages in new directories are found.");

    await unlink(join(directory, "docs/c.md"));
    advance();
    assert.deepEqual([...getPageGraph(directory, options).pages].sort(), ["README.md", "a.md", "b.md"], "Removed pages are dropped.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}));

test("a sweep keeps the graph when a page's file changed but its text did not", () => withClock(async ({ advance }) => {
  const directory = await tree({ "README.md": "# Root\n\n[A](a.md)\n", "a.md": "# A\n" });
  try {
    const graph = getPageGraph(directory, options);
    const later = new Date(Date.now() + 60_000);
    await utimes(join(directory, "README.md"), later, later);
    await utimes(join(directory, "a.md"), later, later);
    advance();
    assert.equal(getPageGraph(directory, options), graph, "Touched pages with the same text keep the graph.");

    await writeFile(join(directory, "README.md"), "# Root\n");
    advance();
    assert.deepEqual(unreachable(getPageGraph(directory, options)), ["a.md"], "Changed text is still parsed again.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}));

test("links to pages that appear later count once the pages exist", () => withClock(async ({ advance }) => {
  const directory = await tree({ "README.md": "# Root\n\n[Later](later.md) [Docs](docs/)\n", "a.md": "# A\n" });
  try {
    assert.deepEqual(unreachable(getPageGraph(directory, options)), ["a.md"]);

    await writeFile(join(directory, "later.md"), "# Later\n\n[A](a.md)\n");
    advance();
    assert.deepEqual(unreachable(getPageGraph(directory, options)), [], "A page added by a sweep is resolved again.");

    await mkdir(join(directory, "docs"));
    await writeFile(join(directory, "docs/README.md"), "# Docs\n");
    const live = getPageGraph(directory, options, { page: "docs/README.md", text: "# Docs\n" });
    assert.ok(live.reachable.has("docs/README.md"), "A page added from linted text is resolved again.");

    await unlink(join(directory, "later.md"));
    advance();
    assert.deepEqual(unreachable(getPageGraph(directory, options)), ["a.md"], "Removing a page drops the edges through it.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}));

test("applies the linted page's text immediately", () => withClock(async ({ advance }) => {
  const directory = await tree({ "README.md": "# Root\n", "a.md": "# A\n" });
  try {
    const built = getPageGraph(directory, options, { page: "README.md", text: "[A](a.md)" });
    assert.deepEqual(unreachable(built), [], "The first build parses the linted page from its text.");

    const same = getPageGraph(directory, options, { page: "README.md", text: "# Root\n\nSee [A](a.md).\n" });
    assert.equal(same, built, "Text with the same links keeps the graph.");

    const edited = getPageGraph(directory, options, { page: "README.md", text: "# Root\n" });
    assert.deepEqual(unreachable(edited), ["a.md"], "Removing a link applies without a sweep.");

    advance();
    assert.deepEqual(unreachable(getPageGraph(directory, options)), ["a.md"], "Linted text persists until the file changes on disk.");

    await writeFile(join(directory, "README.md"), "# Root\n\n[A](a.md)\n");
    advance();
    const saved = getPageGraph(directory, options, { page: "README.md", text: "[A](a.md)" });
    assert.deepEqual(unreachable(saved), [], "A sweep parses the linted page from its text when its file changed.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}));

test("adds a linted page that appeared since the last sweep only when discovery would find it", () => withClock(async () => {
  const directory = await tree({ "README.md": "# Root\n" });
  try {
    getPageGraph(directory, options);
    await writeFile(join(directory, "new.md"), "# New\n");
    await mkdir(join(directory, "node_modules/pkg"), { recursive: true });
    await writeFile(join(directory, "node_modules/pkg/x.md"), "# X\n");
    await writeFile(join(directory, "notes.txt"), "text\n");
    await mkdir(join(directory, "drafts"));
    await writeFile(join(directory, "drafts/d.md"), "# D\n");
    await mkdir(join(directory, "sub"));

    const graph = getPageGraph(directory, options, { page: "new.md", text: "# New\n" });
    assert.deepEqual(unreachable(graph), ["new.md"], "A new page on disk is added and reported.");
    const ignoring = { ...options, ignore: ["drafts/**"] };
    getPageGraph(directory, ignoring);
    for (const [page, settings] of [
      ["unsaved.md", options],
      ["node_modules/pkg/x.md", options],
      ["notes.txt", options],
      ["drafts/d.md", ignoring],
      ["sub", options],
      ["sub/missing.md", options],
      ["README.md/x.md", options],
    ]) {
      const before = getPageGraph(directory, settings);
      assert.equal(getPageGraph(directory, settings, { page, text: "[R](README.md)" }), before, `${page} is not a page.`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}));

test("does not add a linted page reached through a symbolic link", { skip: process.platform === "win32" && "symbolic links need privileges on Windows" }, () => withClock(async () => {
  const directory = await tree({ "README.md": "# Root\n", "target/t.md": "# T\n" });
  try {
    await symlink(join(directory, "target"), join(directory, "linked"));
    const before = getPageGraph(directory, options);
    assert.equal(getPageGraph(directory, options, { page: "linked/t.md", text: "# T\n" }), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}));

test("a missing root directory yields no pages", () => {
  const graph = getPageGraph(join(tmpdir(), "markdown-links-unlinked-missing"), options);
  assert.equal(graph.pages.size, 0);
  assert.deepEqual(graph.roots, []);
});

test("unreadable directories and pages are skipped", { skip: posixOnly }, async () => {
  clearPageGraphCache();
  const directory = await tree({
    "README.md": "[a](a.md) [b](locked/b.md) [s](listed/s.md)",
    "a.md": "[c](c.md)",
    "c.md": "# C",
    "locked/b.md": "# B",
    "listed/s.md": "# S",
  });
  try {
    await chmod(join(directory, "a.md"), 0o000);
    await chmod(join(directory, "locked"), 0o000);
    await chmod(join(directory, "listed"), 0o444);
    const graph = getPageGraph(directory, options);
    assert.deepEqual([...graph.pages].sort(), ["README.md", "a.md", "c.md"]);
    assert.deepEqual([...graph.reachable].sort(), ["README.md", "a.md"]);
  } finally {
    await chmod(join(directory, "a.md"), 0o644);
    await chmod(join(directory, "locked"), 0o755);
    await chmod(join(directory, "listed"), 0o755);
    await rm(directory, { recursive: true, force: true });
  }
});
