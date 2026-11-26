import { mkdtemp, readFile, rm } from "node:fs/promises";
import { availableParallelism, cpus, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import markdown from "@eslint/markdown";
import { ESLint } from "eslint";
import { Bench } from "tinybench";
import plugin from "../src/index.js";
import { buildGraph, clearPageGraphCache, getPageGraph, setClock, SWEEP_INTERVAL } from "../src/graph.js";
import { extractLinks } from "../src/links.js";
import { generate, SHAPES } from "./generate.js";

const PROFILES = {
  full: { sizes: [100, 1000, 5000], micro: 10, fast: 50, eslint: 3, eslintShapes: ["random"] },
  quick: { sizes: [50, 200], micro: 3, fast: 10, eslint: 2, eslintShapes: ["random"] },
};

const options = { roots: ["README.md"], ignore: [], extensions: [".md"] };
const files = ["**/*.md"];

const { values } = parseArgs({
  options: {
    quick: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    sizes: { type: "string" },
    shapes: { type: "string" },
    eslint: { type: "boolean", default: true },
  },
  allowNegative: true,
});
const profile = PROFILES[values.quick ? "quick" : "full"];
const sizes = values.sizes ? values.sizes.split(",").map(Number) : profile.sizes;
const shapes = values.shapes ? values.shapes.split(",") : SHAPES;
for (const shape of shapes) {
  if (!SHAPES.includes(shape)) throw new Error(`Unknown shape: ${shape}. Use one of ${SHAPES.join(", ")}.`);
}
for (const size of sizes) {
  if (!Number.isInteger(size) || size < 2) throw new Error(`Invalid size: ${size}. Use an integer of at least 2.`);
}

/** Lints every page with ESLint and the Markdown language, with or without the rule. */
async function lint(cwd, withRule) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      { files, plugins: { markdown }, language: "markdown/gfm" },
      ...(withRule ? [{ files, ...plugin.configs.recommended }] : []),
    ],
  });
  return eslint.lintFiles(files);
}

/** Checks once, outside timing, that the rule reports exactly the planned orphans. */
async function verify(directory, orphans) {
  clearPageGraphCache();
  const reported = new Set();
  for (const result of await lint(directory, true)) {
    if (result.messages.length > 0) reported.add(result.filePath.slice(directory.length + 1).split("\\").join("/"));
  }
  const missing = [...orphans].filter((page) => !reported.has(page));
  if (missing.length > 0) throw new Error(`Orphans not reported: ${missing.slice(0, 5).join(", ")}.`);
}

function bench(iterations) {
  return new Bench({ time: 0, iterations, warmupTime: 0, warmupIterations: 1, throws: true });
}

/** Runs every benchmark for one generated tree and returns the rows. */
async function measure(directory, shape, size, pages) {
  const live = pages[Math.floor(pages.length / 2)];
  const text = await readFile(join(directory, live), "utf8");
  const changed = `${text}\n[Changed](README.md)\n`;
  const pageLinks = new Map();
  for (const page of pages) pageLinks.set(page, { links: extractLinks(await readFile(join(directory, page), "utf8")) });

  let time = 0;
  const restore = setClock(() => time);
  const rows = [];
  try {
    const micro = bench(profile.micro)
      .add("Cold Graph Build", () => getPageGraph(directory, options), { beforeEach: clearPageGraphCache })
      .add("Sweep Without Changes", () => {
        time += SWEEP_INTERVAL;
        getPageGraph(directory, options);
      }, { beforeAll: () => {
        clearPageGraphCache();
        getPageGraph(directory, options);
      } })
      .add("Reachability", () => buildGraph(pageLinks, options));
    const fast = bench(profile.fast)
      .add("Parse One Page", () => extractLinks(text))
      .add("Live Update, Unchanged", () => getPageGraph(directory, options, { page: live, text }), {
        beforeAll: () => {
          clearPageGraphCache();
          getPageGraph(directory, options, { page: live, text });
        },
      });
    let toggle = false;
    fast.add("Live Update, Changed", () => {
      toggle = !toggle;
      getPageGraph(directory, options, { page: live, text: toggle ? changed : text });
    }, { beforeAll: () => {
      clearPageGraphCache();
      getPageGraph(directory, options, { page: live, text });
    } });
    for (const run of [micro, fast]) {
      for (const task of await run.run()) rows.push(row(task, shape, size));
    }
  } finally {
    restore();
    clearPageGraphCache();
  }

  if (values.eslint && profile.eslintShapes.includes(shape)) {
    const eslint = bench(profile.eslint)
      .add("ESLint Without Rule", () => lint(directory, false), { beforeEach: clearPageGraphCache })
      .add("ESLint With Rule", () => lint(directory, true), { beforeEach: clearPageGraphCache });
    const [without, withRule] = (await eslint.run()).map((task) => row(task, shape, size));
    rows.push(without, withRule, {
      name: "Rule Overhead",
      shape,
      pages: size,
      median: withRule.median - without.median,
      mean: withRule.mean - without.mean,
      moe: withRule.moe + without.moe,
      samples: Math.min(withRule.samples, without.samples),
    });
  }
  return rows;
}

function row(task, shape, pages) {
  const { latency } = task.result;
  return { name: task.name, shape, pages, median: latency.p50, mean: latency.mean, moe: latency.moe, samples: latency.samplesCount };
}

function format(rows) {
  const header = ["Benchmark", "Shape", "Pages", "Median (ms)", "Mean ± MOE (ms)", "Per Page (µs)", "Samples"];
  const body = rows.map((entry) => [
    entry.name,
    entry.shape,
    String(entry.pages),
    entry.median.toFixed(3),
    `${entry.mean.toFixed(3)} ± ${entry.moe.toFixed(3)}`,
    entry.name === "Parse One Page" || entry.name.startsWith("Live Update")
      ? "-"
      : ((entry.median * 1000) / entry.pages).toFixed(1),
    String(entry.samples),
  ]);
  const widths = header.map((title, index) => Math.max(title.length, ...body.map((cells) => cells[index].length)));
  const line = (cells) => `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...body.map(line)].join("\n");
}

const environment = {
  node: process.version,
  eslint: ESLint.version,
  cpu: cpus()[0]?.model ?? "unknown",
  cores: availableParallelism(),
  platform: process.platform,
  profile: values.quick ? "quick" : "full",
};
const rows = [];
for (const shape of shapes) {
  for (const size of sizes) {
    const directory = await mkdtemp(join(tmpdir(), "markdown-links-unlinked-bench-"));
    try {
      const { pages, orphans } = await generate(directory, shape, size);
      await verify(directory, orphans);
      rows.push(...await measure(directory, shape, size, pages));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    if (!values.json) process.stderr.write(`Measured ${shape} with ${size} pages.\n`);
  }
}

if (values.json) {
  process.stdout.write(`${JSON.stringify({ environment, results: rows }, null, 2)}\n`);
} else {
  process.stdout.write(`Node ${environment.node}, ESLint ${environment.eslint}, ${environment.cpu} (${environment.cores} cores), ${environment.platform}, ${environment.profile} profile.\n\n${format(rows)}\n`);
}
