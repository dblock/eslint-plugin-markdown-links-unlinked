import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import picomatch from "picomatch";
import { extractLinks } from "./links.js";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
const DIRECTORY_PAGES = ["README", "index"];
const SCHEME = /^[a-z][a-z\d+.-]*:/iu;

/** @type {Map<string, {snapshot: Map<string, string>, graph: PageGraph}>} */
const cache = new Map();

/**
 * @typedef {object} PageGraph
 * @property {Set<string>} pages Discovered pages, as `/`-separated paths relative to the root directory.
 * @property {string[]} roots Discovered pages matching the root patterns.
 * @property {Set<string>} reachable Pages reachable from a root.
 */

/**
 * Returns the link graph for a root directory and options, reusing the previous graph while no
 * page or walked directory has been added, removed, or modified.
 * @param {string} rootDir Absolute root directory.
 * @param {{roots: string[], ignore: string[], extensions: string[]}} options Normalized options.
 * @returns {PageGraph} The page graph.
 */
export function getPageGraph(rootDir, options) {
  const key = JSON.stringify([rootDir, options.roots, options.ignore, options.extensions]);
  const cached = cache.get(key);
  if (cached && isCurrent(rootDir, cached.snapshot)) return cached.graph;
  const { pages, snapshot } = discover(rootDir, options);
  const graph = buildGraph(rootDir, pages, options);
  cache.set(key, { snapshot, graph });
  return graph;
}

/** Clears cached graphs. */
export function clearPageGraphCache() {
  cache.clear();
}

/**
 * Walks the root directory for pages, recording each walked directory and page with its
 * modification time and size so later calls can detect changes without walking again.
 * Symbolic links are not followed.
 */
function discover(rootDir, { ignore, extensions }) {
  const isIgnored = picomatch(ignore, { dot: true });
  const pages = [];
  const snapshot = new Map();
  const walk = (relative) => {
    const absolute = relative ? join(rootDir, relative) : rootDir;
    snapshot.set(relative, signature(absolute));
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))
        && !isIgnored(path)) {
        pages.push(path);
        snapshot.set(path, signature(join(rootDir, path)));
      }
    }
  };
  walk("");
  return { pages, snapshot };
}

function signature(path) {
  try {
    const stats = statSync(path);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

function isCurrent(rootDir, snapshot) {
  for (const [relative, value] of snapshot) {
    if (signature(relative ? join(rootDir, relative) : rootDir) !== value) return false;
  }
  return true;
}

function buildGraph(rootDir, pageList, { roots: rootPatterns, extensions }) {
  const pages = new Set(pageList);
  const isRoot = picomatch(rootPatterns, { dot: true });
  const roots = pageList.filter((page) => isRoot(page));
  const reachable = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const page = queue.shift();
    let text;
    try {
      text = readFileSync(join(rootDir, page), "utf8");
    } catch {
      continue;
    }
    for (const destination of extractLinks(text)) {
      for (const target of resolveTargets(page, destination, pages, extensions)) {
        if (!reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
  }
  return { pages, roots, reachable };
}

/**
 * Resolves a link destination on a page to the discovered pages it reaches.
 * @param {string} page Linking page.
 * @param {string} destination Link destination as parsed from Markdown.
 * @param {Set<string>} pages Discovered pages.
 * @param {string[]} extensions Page extensions.
 * @returns {string[]} Reached pages.
 */
export function resolveTargets(page, destination, pages, extensions) {
  if (SCHEME.test(destination) || destination.startsWith("//")) return [];
  const path = destination.replace(/[?#].*$/su, "");
  if (path === "") return [];
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = path;
  }
  const joined = decoded.startsWith("/")
    ? posix.normalize(`.${decoded}`)
    : posix.join(posix.dirname(page), decoded);
  const target = joined.replace(/\/+$/u, "");
  if (target === ".." || target.startsWith("../")) return [];
  if (pages.has(target)) return [target];
  const directory = target === "." || target === "" ? "" : `${target}/`;
  const reached = [];
  for (const name of DIRECTORY_PAGES) {
    for (const extension of extensions) {
      const candidate = `${directory}${name}${extension}`;
      if (pages.has(candidate)) reached.push(candidate);
    }
  }
  return reached;
}
