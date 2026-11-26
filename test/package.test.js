import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("the packed archive installs and loads in a consumer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markdown-links-unlinked-consumer-"));
  try {
    const override = process.env.PACKAGE_ARCHIVE;
    let archive;
    let paths;
    if (override) {
      archive = override;
      paths = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
        .trim().split("\n").map((path) => path.replace(/^package\//u, ""));
    } else {
      const [packed] = JSON.parse(execFileSync(
        npm, ["pack", "--json", "--pack-destination", directory],
        { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
      ));
      archive = join(directory, packed.filename);
      paths = packed.files.map((file) => file.path);
    }
    for (const path of ["package.json", "src/index.js", "README.md", "LICENSE"]) {
      assert.ok(paths.includes(path), `The archive must include ${path}.`);
    }
    assert.ok(paths.every((path) =>
      !/^(?:test|scripts|node_modules|coverage)\//u.test(path) && !path.endsWith(".tgz")
    ), "The archive must exclude development and generated files.");
    await writeFile(join(directory, "package.json"), JSON.stringify({
      private: true,
      type: "module",
      dependencies: { eslint: ESLint.version, "@eslint/markdown": markdown.meta.version },
    }));
    execFileSync(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive], {
      cwd: directory, stdio: "pipe", shell: process.platform === "win32",
    });
    const installed = JSON.parse(await readFile(join(
      directory, "node_modules/eslint-plugin-markdown-links-unlinked/package.json",
    ), "utf8"));
    assert.equal(installed.version, manifest.version);
    await writeFile(join(directory, "eslint.config.js"), `import markdown from "@eslint/markdown";
import unlinked from "eslint-plugin-markdown-links-unlinked";
export default [
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
  { files: ["**/*.md"], ...unlinked.configs.recommended },
];
`);
    await writeFile(join(directory, "README.md"), "# Consumer\n");
    const result = spawnSync(process.execPath, [
      join(directory, "node_modules/eslint/bin/eslint.js"), "--format", "json", "README.md",
    ], { cwd: directory, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout)[0].messages, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
