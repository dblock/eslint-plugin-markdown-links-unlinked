import { readFileSync } from "node:fs";
import noUnlinkedPages from "./rules/no-unlinked-pages.js";

const { name, version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const plugin = {
  meta: { name, version, namespace: "markdown-links-unlinked" },
  rules: { "no-unlinked-pages": noUnlinkedPages },
  configs: {},
};

plugin.configs.recommended = {
  name: "markdown-links-unlinked/recommended",
  plugins: { "markdown-links-unlinked": plugin },
  rules: { "markdown-links-unlinked/no-unlinked-pages": "error" },
};

export default plugin;
