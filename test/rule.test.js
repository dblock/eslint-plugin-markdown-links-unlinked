import assert from "node:assert/strict";
import { join } from "node:path";
import test, { beforeEach } from "node:test";
import { ESLint, RuleTester } from "eslint";
import markdown from "@eslint/markdown";
import { clearPageGraphCache } from "../src/graph.js";
import plugin from "../src/index.js";
import { createESLint, fixtures, lintTree, reported } from "../test-support/lint.js";

// Linted text updates the per-process graph, so start each test from the files on disk.
beforeEach(() => clearPageGraphCache());

const unlinked = "1:1 This page is not linked from any root page (README.md).";

test("follows every kind of local link and reports only unreachable pages", async () => {
  const messages = await lintTree(join(fixtures, "links"));
  assert.deepEqual(reported(messages), [
    "case.md",
    "frontmatter-target.md",
    "guide/other.md",
    "image-only.md",
    "image-target.md",
    "protocol.md",
    "unused.md",
  ]);
  assert.deepEqual(messages["case.md"], [unlinked]);
  for (const reachable of [
    "%E0%A4%A.md", "README.md", "angle page.md", "block.md", "both/README.md", "both/index.md",
    "collapsed.md", "docs/absolute.md", "docs/inline.md", "docs/sub/nested.md", "dot.md",
    "footnote.md", "fragment.md", "frontmatter.md", "guide/README.md", "html.md",
    "manual/index.md", "my page.md", "query.md", "reference.md", "relative.md", "wrapped.md",
  ]) {
    assert.deepEqual(messages[reachable], [], `${reachable} should be reachable.`);
  }
});

test("finds the same links with the CommonMark and GFM languages", async () => {
  const gfm = await lintTree(join(fixtures, "links"));
  clearPageGraphCache();
  const commonmark = await lintTree(join(fixtures, "links"), undefined, { language: "markdown/commonmark" });
  assert.deepEqual(commonmark, gfm);
});

test("counts the links in unsaved text immediately", async () => {
  const eslint = createESLint(join(fixtures, "defaults"));
  const [before] = await eslint.lintFiles(["c.md"]);
  assert.equal(before.messages.length, 1, "c.md is unlinked on disk.");
  await eslint.lintText("# Root\n\n[C](c.md)\n", { filePath: "README.md" });
  const [after] = await eslint.lintFiles(["c.md"]);
  assert.deepEqual(after.messages, [], "An unsaved link from the root reaches c.md.");
});

test("allows default pages, terminates cycles, and ignores non-page extensions", async () => {
  const messages = await lintTree(join(fixtures, "defaults"));
  assert.deepEqual(reported(messages), ["c.md", "d.md", "hidden.md"]);
  for (const allowed of [
    ".github/PULL_REQUEST_TEMPLATE.md", "CHANGELOG.md", "CODE_OF_CONDUCT.md", "LICENSE.md", "SECURITY.md",
  ]) {
    assert.deepEqual(messages[allowed], []);
  }
});

test("reports a missing root on every page", async () => {
  const messages = await lintTree(join(fixtures, "missing-root"));
  assert.deepEqual(messages, { "guide.md": ["1:1 No root page found: README.md."] });
});

test("supports multiple roots and lists them in the message", async () => {
  const messages = await lintTree(join(fixtures, "options"), { roots: ["README.md", "docs/index.md"] });
  assert.deepEqual(reported(messages), ["docs/README.md", "from-mdx.md", "notes/note.md"]);
  assert.deepEqual(messages["notes/note.md"], [
    "1:1 This page is not linked from any root page (README.md, docs/index.md).",
  ]);
});

test("ignored pages are neither reported nor followed", async () => {
  const messages = await lintTree(join(fixtures, "options"), {
    roots: ["README.md", "docs/index.md"],
    ignore: ["drafts/**"],
  });
  assert.deepEqual(reported(messages), ["docs/README.md", "from-mdx.md", "notes/note.md", "via-draft.md"]);
});

test("allow replaces the default allowed pages", async () => {
  const messages = await lintTree(join(fixtures, "options"), {
    roots: ["README.md", "docs/index.md"],
    allow: ["notes/**", "docs/README.md", "from-mdx.md"],
  });
  assert.deepEqual(reported(messages), []);
  const defaults = await lintTree(join(fixtures, "defaults"), { allow: [] });
  assert.deepEqual(reported(defaults), [
    ".github/PULL_REQUEST_TEMPLATE.md", "CHANGELOG.md", "CODE_OF_CONDUCT.md", "LICENSE.md",
    "SECURITY.md", "c.md", "d.md", "hidden.md",
  ]);
});

test("extensions select which files are pages", async () => {
  const files = ["**/*.md", "**/*.mdx"];
  const defaults = await lintTree(join(fixtures, "options"), { roots: ["README.md", "component.mdx"] }, { files });
  assert.deepEqual(defaults["component.mdx"], [], "Non-page files are never reported.");
  assert.ok(reported(defaults).includes("from-mdx.md"), "Links from non-page files do not count.");
  const messages = await lintTree(join(fixtures, "options"), {
    roots: ["README.md", "component.mdx"],
    extensions: [".md", ".mdx"],
  }, { files });
  assert.deepEqual(messages["component.mdx"], []);
  assert.deepEqual(messages["from-mdx.md"], []);
});

test("rootDir scopes discovery, roots, and reports", async () => {
  const messages = await lintTree(join(fixtures, "options"), { rootDir: "docs" });
  assert.deepEqual(reported(messages), ["docs/index.md", "docs/start.md"]);
  assert.deepEqual(messages["notes/note.md"], [], "Pages outside rootDir are not checked.");
});

test("does not report text without a discovered file", async () => {
  const eslint = new ESLint({
    cwd: join(fixtures, "defaults"),
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
      { files: ["**/*.md"], ...plugin.configs.recommended },
    ],
  });
  const [unsaved] = await eslint.lintText("# Unsaved\n", { filePath: "unsaved.md" });
  assert.deepEqual(unsaved.messages, []);
});

test("rejects invalid options", async () => {
  for (const options of [
    { roots: [] },
    { extensions: ["md"] },
    { extensions: [".*"] },
    { rootDir: "" },
    { unknown: true },
  ]) {
    const eslint = new ESLint({
      cwd: join(fixtures, "defaults"),
      overrideConfigFile: true,
      overrideConfig: [
        { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
        { files: ["**/*.md"], ...plugin.configs.recommended },
        { files: ["**/*.md"], rules: { "markdown-links-unlinked/no-unlinked-pages": ["error", options] } },
      ],
    });
    await assert.rejects(eslint.lintFiles(["README.md"]), /no-unlinked-pages/u, JSON.stringify(options));
  }
});

const ruleTester = new RuleTester({ plugins: { markdown }, language: "markdown/gfm" });
const rootDir = join(fixtures, "defaults");

ruleTester.run("no-unlinked-pages", plugin.rules["no-unlinked-pages"], {
  valid: [
    { code: "# A\n", filename: join(rootDir, "a.md"), options: [{ rootDir }] },
    { code: "# Root\n", filename: join(rootDir, "README.md"), options: [{ rootDir }] },
    { code: "# Changelog\n", filename: join(rootDir, "CHANGELOG.md"), options: [{ rootDir }] },
    { code: "# Directory\n", filename: rootDir, options: [{ rootDir }] },
  ],
  invalid: [
    {
      code: "# C\n",
      filename: join(rootDir, "c.md"),
      options: [{ rootDir }],
      errors: [{ messageId: "unlinked", data: { roots: "README.md" }, line: 1, column: 1 }],
    },
    {
      code: "",
      filename: join(rootDir, "d.md"),
      options: [{ rootDir, roots: ["missing.md", "README.md"] }],
      errors: [{ messageId: "unlinked", data: { roots: "missing.md, README.md" }, line: 1, column: 1 }],
    },
    {
      code: "# A\n",
      filename: join(rootDir, "a.md"),
      options: [{ rootDir, roots: ["missing.md"] }],
      errors: [{ messageId: "missingRoot", data: { roots: "missing.md" } }],
    },
  ],
});
