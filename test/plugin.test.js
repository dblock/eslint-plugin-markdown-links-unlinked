import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import plugin from "../src/index.js";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("exports plugin metadata from the package manifest", () => {
  assert.deepEqual(plugin.meta, {
    name: "eslint-plugin-markdown-links-unlinked",
    version: manifest.version,
    namespace: "markdown-links-unlinked",
  });
});

test("exports a recommended config that registers the plugin", () => {
  assert.equal(plugin.configs.recommended.name, "markdown-links-unlinked/recommended");
  assert.equal(plugin.configs.recommended.plugins["markdown-links-unlinked"], plugin);
  assert.deepEqual(plugin.configs.recommended.rules, { "markdown-links-unlinked/no-unlinked-pages": "error" });
});

test("exports the no-unlinked-pages rule for Markdown languages", () => {
  assert.deepEqual(Object.keys(plugin.rules), ["no-unlinked-pages"]);
  assert.deepEqual(plugin.rules["no-unlinked-pages"].meta.languages, ["markdown/*"]);
});

test("loads in ESLint with the Markdown language", async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
      { files: ["**/*.md"], ...plugin.configs.recommended },
    ],
  });
  const [result] = await eslint.lintText("# Title\n", { filePath: "README.md" });
  assert.deepEqual(result.messages, []);
});
