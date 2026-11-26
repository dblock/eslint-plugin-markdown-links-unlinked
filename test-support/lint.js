import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import plugin from "../src/index.js";

export const fixtures = fileURLToPath(new URL("../test/fixtures/", import.meta.url));

/**
 * Lints a directory tree with the real ESLint API and returns the diagnostics for each linted
 * file, keyed by its `/`-separated path relative to the directory.
 * @param {string} cwd Directory to lint, used as ESLint's working directory.
 * @param {object} [options] Rule options; omitted to use the recommended config's defaults.
 * @param {object} [settings] Extra settings.
 * @param {string[]} [settings.files] Globs ESLint lints with the Markdown language.
 * @returns {Promise<Record<string, string[]>>} Messages for each file.
 */
export async function lintTree(cwd, options, { files = ["**/*.md"] } = {}) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      { files, plugins: { markdown }, language: "markdown/gfm" },
      { files, ...plugin.configs.recommended },
      ...(options
        ? [{ files, rules: { "markdown-links-unlinked/no-unlinked-pages": ["error", options] } }]
        : []),
    ],
  });
  const results = await eslint.lintFiles(files);
  const messages = {};
  for (const result of results) {
    const path = relative(cwd, result.filePath).split(sep).join("/");
    messages[path] = result.messages.map((message) => {
      if (message.ruleId !== "markdown-links-unlinked/no-unlinked-pages") return message.message;
      return `${message.line}:${message.column} ${message.message}`;
    });
  }
  return messages;
}

/**
 * Returns the sorted paths that have at least one diagnostic.
 * @param {Record<string, string[]>} messages Messages for each file.
 * @returns {string[]} Reported paths.
 */
export function reported(messages) {
  return Object.keys(messages).filter((path) => messages[path].length > 0).sort();
}
