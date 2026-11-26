import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import picomatch from "picomatch";
import { extractLinks } from "./links.js";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
const DIRECTORY_PAGES = ["README", "index"];
const SCHEME = /^[a-z][a-z\d+.-]*:/iu;

/** Milliseconds between sweeps of the file system for changes made outside ESLint. */
export const SWEEP_INTERVAL = 2000;

let now = () => Date.now();

/**
 * @typedef {object} PageGraph
 * @property {Set<string>} pages Discovered pages, as `/`-separated paths relative to the root directory.
 * @property {string[]} roots Discovered pages matching the root patterns.
 * @property {Set<string>} reachable Pages reachable from a root.
 */

/**
 * @typedef {object} GraphState
 * @property {Map<string, {signature: string, links: string[]}>} pages Each page's file signature and link destinations.
 * @property {number} sweptAt Clock time of the last sweep.
 * @property {PageGraph | undefined} graph Reachability for the current pages, or `undefined` once edges change.
 */

/** @type {Map<string, GraphState>} */
const states = new Map();

/**
 * Returns the link graph for a root directory and options. The graph is built once per process,
 * swept for changes made outside ESLint at most every {@link SWEEP_INTERVAL} milliseconds, and
 * updated from the text of each linted page so its current links count without reading it from disk.
 * @param {string} rootDir Absolute root directory.
 * @param {{roots: string[], ignore: string[], extensions: string[]}} options Normalized options.
 * @param {{page: string, text: string}} [live] The linted page and its current text.
 * @returns {PageGraph} The page graph.
 */
export function getPageGraph(rootDir, options, live) {
  const key = JSON.stringify([rootDir, options.roots, options.ignore, options.extensions]);
  let state = states.get(key);
  let parsedLive = false;
  if (!state) {
    state = { pages: new Map(), sweptAt: now(), graph: undefined };
    states.set(key, state);
    parsedLive = sweep(rootDir, options, state, live);
  } else if (now() - state.sweptAt >= SWEEP_INTERVAL) {
    state.sweptAt = now();
    parsedLive = sweep(rootDir, options, state, live);
  }
  if (live && !parsedLive) applyLive(rootDir, options, state, live);
  state.graph ??= buildGraph(state.pages, options);
  return state.graph;
}

/** Clears all graphs. */
export function clearPageGraphCache() {
  states.clear();
}

/**
 * Replaces the clock that throttles sweeps. For tests.
 * @param {() => number} clock Returns the current time in milliseconds.
 * @returns {() => void} Restores the previous clock.
 */
export function setClock(clock) {
  const previous = now;
  now = clock;
  return () => {
    now = previous;
  };
}

/**
 * Walks the root directory and brings the state up to date: pages that disappeared are dropped,
 * and pages that are new or whose modification time or size changed are parsed again. The linted
 * page is parsed from its live text instead of from disk.
 * @returns {boolean} Whether the linted page was parsed.
 */
function sweep(rootDir, options, state, live) {
  const found = discover(rootDir, options);
  for (const page of state.pages.keys()) {
    if (!found.has(page)) {
      state.pages.delete(page);
      state.graph = undefined;
    }
  }
  let parsedLive = false;
  for (const [page, signature] of found) {
    if (state.pages.get(page)?.signature === signature) continue;
    const isLive = live?.page === page;
    parsedLive ||= isLive;
    const text = isLive ? live.text : read(join(rootDir, page));
    state.pages.set(page, { signature, links: text === undefined ? [] : extractLinks(text) });
    state.graph = undefined;
  }
  return parsedLive;
}

/**
 * Replaces the linted page's links with those in its current text, adding the page when it is on
 * disk but appeared since the last sweep. Text without a qualifying file is ignored.
 */
function applyLive(rootDir, options, state, { page, text }) {
  let entry = state.pages.get(page);
  if (!entry) {
    const signature = pageSignature(rootDir, page, options);
    if (signature === undefined) return;
    entry = { signature, links: [] };
    state.pages.set(page, entry);
    state.graph = undefined;
  }
  const links = extractLinks(text);
  if (links.length === entry.links.length && links.every((link, index) => link === entry.links[index])) return;
  entry.links = links;
  state.graph = undefined;
}

/**
 * Walks the root directory for pages and their signatures. Symbolic links are not followed.
 * @returns {Map<string, string>} Signature of each page.
 */
function discover(rootDir, { ignore, extensions }) {
  const isIgnored = picomatch(ignore, { dot: true });
  const pages = new Map();
  const walk = (relative) => {
    let entries;
    try {
      entries = readdirSync(relative ? join(rootDir, relative) : rootDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))
        && !isIgnored(path)) {
        const value = signature(join(rootDir, path));
        if (value !== undefined) pages.set(path, value);
      }
    }
  };
  walk("");
  return pages;
}

/**
 * Returns the signature of a page that discovery would find, or `undefined` when the path is not
 * a page: a skipped or ignored path, another extension, a missing file, or one reached through a
 * symbolic link.
 */
function pageSignature(rootDir, page, { ignore, extensions }) {
  const segments = page.split("/");
  const name = segments.at(-1);
  if (segments.slice(0, -1).some((segment) => SKIPPED_DIRECTORIES.has(segment))) return undefined;
  if (!extensions.some((extension) => name.endsWith(extension))) return undefined;
  if (picomatch(ignore, { dot: true })(page)) return undefined;
  let path = rootDir;
  for (const [index, segment] of segments.entries()) {
    path = join(path, segment);
    let stats;
    try {
      stats = lstatSync(path);
    } catch {
      return undefined;
    }
    if (index === segments.length - 1 ? !stats.isFile() : !stats.isDirectory()) return undefined;
  }
  return signature(path);
}

/** Returns a file's modification time and size, or `undefined` when it cannot be read. */
function signature(path) {
  try {
    const stats = statSync(path);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return undefined;
  }
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Computes which pages are reachable from the roots by a breadth-first search over the links.
 * @param {Map<string, {links: string[]}>} pageLinks Each discovered page's link destinations.
 * @param {{roots: string[], extensions: string[]}} options Normalized options.
 * @returns {PageGraph} The page graph.
 */
export function buildGraph(pageLinks, { roots: rootPatterns, extensions }) {
  const pages = new Set(pageLinks.keys());
  const isRoot = picomatch(rootPatterns, { dot: true });
  const roots = [...pages].filter((page) => isRoot(page));
  const reachable = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const page = queue.shift();
    for (const destination of pageLinks.get(page).links) {
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
