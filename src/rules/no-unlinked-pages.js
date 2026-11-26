import { isAbsolute, relative, resolve, sep } from "node:path";
import picomatch from "picomatch";
import { getPageGraph } from "../graph.js";

export const DEFAULT_OPTIONS = Object.freeze({
  roots: Object.freeze(["README.md"]),
  allow: Object.freeze(["CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/**"]),
  ignore: Object.freeze([]),
  extensions: Object.freeze([".md"]),
});

const patterns = { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true };

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow Markdown pages that are not linked from any root page",
      url: "https://github.com/dblock/eslint-plugin-markdown-links-unlinked#configuration",
    },
    languages: ["markdown/*"],
    schema: [{
      type: "object",
      properties: {
        roots: { ...patterns, minItems: 1 },
        allow: patterns,
        ignore: patterns,
        extensions: {
          type: "array",
          items: { type: "string", pattern: "^\\.[^/\\\\*?{}\\[\\]!]+$" },
          minItems: 1,
          uniqueItems: true,
        },
        rootDir: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    }],
    messages: {
      unlinked: "This page is not linked from any root page ({{roots}}).",
      missingRoot: "No root page found: {{roots}}.",
    },
  },

  create(context) {
    const options = { ...DEFAULT_OPTIONS, ...context.options[0] };
    const rootDir = resolve(context.cwd, options.rootDir ?? ".");
    const path = relative(rootDir, context.filename);
    if (path === "" || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return {};
    const page = path.split(sep).join("/");
    if (picomatch(options.allow, { dot: true })(page)) return {};

    return {
      root(node) {
        const graph = getPageGraph(rootDir, options);
        if (!graph.pages.has(page) || graph.reachable.has(page)) return;
        const roots = options.roots.join(", ");
        context.report({
          loc: node.position.start,
          messageId: graph.roots.length === 0 ? "missingRoot" : "unlinked",
          data: { roots },
        });
      },
    };
  },
};
