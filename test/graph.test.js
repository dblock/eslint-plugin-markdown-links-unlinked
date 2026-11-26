import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { clearPageGraphCache, getPageGraph, resolveTargets } from "../src/graph.js";
import { extractLinks } from "../src/links.js";
import { lintTree, reported } from "../test-support/lint.js";

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

test("reuses the graph until a page or directory changes", async () => {
  clearPageGraphCache();
  const directory = await tree({ "README.md": "# Root\n", "a.md": "# A\n" });
  try {
    assert.deepEqual(reported(await lintTree(directory)), ["a.md"]);
    const graph = getPageGraph(directory, options);
    assert.equal(getPageGraph(directory, options), graph, "An unchanged tree reuses the graph.");
    assert.notEqual(getPageGraph(directory, { ...options, ignore: ["x"] }), graph, "Options are part of the key.");

    await writeFile(join(directory, "README.md"), "# Root\n\n[A](a.md)\n");
    assert.deepEqual(reported(await lintTree(directory)), [], "A modified page rebuilds the graph.");

    await writeFile(join(directory, "b.md"), "# B\n");
    assert.deepEqual(reported(await lintTree(directory)), ["b.md"], "An added page rebuilds the graph.");

    await mkdir(join(directory, "docs"));
    await writeFile(join(directory, "docs/c.md"), "# C\n");
    assert.deepEqual(reported(await lintTree(directory)), ["b.md", "docs/c.md"], "A page in a new directory is found.");

    await writeFile(join(directory, "a.md"), "# A\n\n[B](b.md)\n");
    await unlink(join(directory, "docs/c.md"));
    assert.deepEqual(reported(await lintTree(directory)), [], "Removed pages and new links are picked up.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a missing root directory yields no pages", () => {
  const graph = getPageGraph(join(tmpdir(), "markdown-links-unlinked-missing"), options);
  assert.equal(graph.pages.size, 0);
  assert.deepEqual(graph.roots, []);
});

test("unreadable directories and pages are skipped", { skip: posixOnly }, async () => {
  const directory = await tree({
    "README.md": "[a](a.md) [b](locked/b.md)",
    "a.md": "[c](c.md)",
    "c.md": "# C",
    "locked/b.md": "# B",
  });
  try {
    await chmod(join(directory, "a.md"), 0o000);
    await chmod(join(directory, "locked"), 0o000);
    const graph = getPageGraph(directory, options);
    assert.deepEqual([...graph.pages].sort(), ["README.md", "a.md", "c.md"]);
    assert.deepEqual([...graph.reachable].sort(), ["README.md", "a.md"]);
  } finally {
    await chmod(join(directory, "a.md"), 0o644);
    await chmod(join(directory, "locked"), 0o755);
    await rm(directory, { recursive: true, force: true });
  }
});
