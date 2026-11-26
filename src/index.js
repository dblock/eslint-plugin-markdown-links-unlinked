import { readFileSync } from "node:fs";

const { name, version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const plugin = {
  meta: { name, version, namespace: "markdown-links-unlinked" },
  rules: {},
  configs: {},
};

plugin.configs.recommended = {
  name: "markdown-links-unlinked/recommended",
  plugins: { "markdown-links-unlinked": plugin },
  rules: {},
};

export default plugin;
