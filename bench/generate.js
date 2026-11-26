import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

/** Tree shapes the benchmarks generate. */
export const SHAPES = ["wide", "chain", "random", "nested"];

/**
 * Returns a deterministic pseudo-random number generator (mulberry32).
 * @param {number} seed Seed.
 * @returns {() => number} Numbers in `[0, 1)`.
 */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plans a documentation tree: the page paths and, for each page, the pages it links to.
 * @param {string} shape One of {@link SHAPES}.
 * @param {number} count Number of pages, including `README.md`.
 * @param {number} [seed] Seed for the pseudo-random choices.
 * @returns {{pages: string[], links: Map<string, string[]>, orphans: Set<string>}} The plan.
 */
export function plan(shape, count, seed = 1) {
  const next = random(seed);
  const pick = (items) => items[Math.floor(next() * items.length)];
  const pages = ["README.md"];
  const links = new Map([["README.md", []]]);
  const orphans = new Set();
  const add = (page, targets = []) => {
    pages.push(page);
    links.set(page, targets);
  };

  switch (shape) {
    case "wide":
      // README links to every page; pages also link to a few random siblings.
      for (let index = 1; index < count; index++) add(`docs/page-${index}.md`);
      for (const page of pages.slice(1)) {
        links.get("README.md").push(page);
        for (let link = 0; link < 2; link++) links.get(page).push(pick(pages));
      }
      break;
    case "chain":
      // README links to the first page, and each page links only to the next one.
      for (let index = 1; index < count; index++) add(`chain/page-${index}.md`);
      for (let index = 0; index < pages.length - 1; index++) links.get(pages[index]).push(pages[index + 1]);
      break;
    case "random": {
      // About 10% of pages are orphans that nothing links to; every other page gets three
      // random outgoing links, and README links to ten pages.
      for (let index = 1; index < count; index++) {
        const page = `pages/section-${index % 20}/page-${index}.md`;
        add(page);
        if (next() < 0.1) orphans.add(page);
      }
      const linkable = pages.filter((page) => !orphans.has(page) && page !== "README.md");
      for (const page of pages) {
        const outgoing = page === "README.md" ? 10 : 3;
        for (let link = 0; link < outgoing && linkable.length > 0; link++) links.get(page).push(pick(linkable));
      }
      break;
    }
    case "nested": {
      // Directories up to five levels deep; each directory's README links to its pages and to
      // its subdirectories by directory link.
      const directories = [""];
      while (pages.length < count) {
        const parent = pick(directories);
        const depth = parent === "" ? 0 : parent.split("/").length;
        if (depth < 5 && next() < 0.2) {
          const directory = `${parent}${parent ? "/" : ""}dir-${directories.length}`;
          directories.push(directory);
          add(`${directory}/README.md`);
          links.get(parent ? `${parent}/README.md` : "README.md").push(`${directory}/`);
        } else {
          const page = `${parent}${parent ? "/" : ""}page-${pages.length}.md`;
          add(page);
          links.get(parent ? `${parent}/README.md` : "README.md").push(page);
          links.get(page).push(pick(pages));
        }
      }
      break;
    }
    default:
      throw new Error(`Unknown shape: ${shape}.`);
  }
  return { pages, links, orphans };
}

/**
 * Renders a realistic page: front matter, headings, paragraphs, a code block, an image,
 * external links, and its outgoing links as inline links, reference links, and HTML anchors.
 * @param {string} page Page path.
 * @param {string[]} targets Linked pages or directories.
 * @param {() => number} next Pseudo-random number generator.
 * @returns {string} Markdown source.
 */
export function render(page, targets, next) {
  const relative = (target) => {
    const path = posix.relative(posix.dirname(page), target.replace(/\/$/u, "")) || ".";
    return target.endsWith("/") ? `${path}/` : path;
  };
  const lines = [
    "---",
    `title: ${page}`,
    "tags: [docs, benchmark]",
    "---",
    "",
    `# ${page}`,
    "",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. See [the website](https://example.com/docs) and <https://example.org>.",
    "",
    "![Diagram](images/diagram.png)",
    "",
  ];
  const definitions = [];
  for (const [index, target] of targets.entries()) {
    const destination = relative(target);
    const fragment = next() < 0.3 ? "#section" : "";
    switch (index % 3) {
      case 0:
        lines.push(`- Read [${target}](${destination}${fragment}) for details.`);
        break;
      case 1:
        lines.push(`- Continue with [${target}][link-${index}].`);
        definitions.push(`[link-${index}]: ${destination}${fragment}`);
        break;
      default:
        lines.push(`- <a href="${destination}${fragment}">${target}</a>`);
    }
  }
  lines.push(
    "",
    "## Example",
    "",
    "```js",
    "import plugin from \"eslint-plugin-markdown-links-unlinked\";",
    "const link = \"[not a link](nowhere.md)\";",
    "```",
    "",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    "",
    "| Column | Value |",
    "| --- | --- |",
    "| a | `b` |",
    "",
    ...definitions,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Writes a planned tree to a directory.
 * @param {string} directory Existing directory to write into.
 * @param {string} shape One of {@link SHAPES}.
 * @param {number} count Number of pages.
 * @param {number} [seed] Seed.
 * @returns {Promise<{pages: string[], orphans: Set<string>}>} The written pages and planned orphans.
 */
export async function generate(directory, shape, count, seed = 1) {
  const { pages, links, orphans } = plan(shape, count, seed);
  const next = random(seed + 1);
  for (const page of pages) {
    const path = join(directory, page);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, render(page, links.get(page), next));
  }
  return { pages, orphans };
}
