import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// npm-package-release requires Node.js ^22.14.0 || ^24 || >=26; the plugin itself supports 22.13.
const [major, minor] = process.versions.node.split(".").map(Number);
const supportsRelease = (major === 22 && minor >= 14) || major === 24 || major >= 26;

test("the release configuration publishes the validated archive and prepares the next version", {
  skip: !supportsRelease,
}, async (t) => {
  const { ReleaseTestProject } = await import("npm-package-release/testing");
  const { createReleaseWorkflow } = await import("../npr.config.js");
  const project = await ReleaseTestProject.create();
  t.after(() => project.dispose());
  const root = fileURLToPath(new URL("../", import.meta.url));
  await project.copyFiles(root, [
    ".gitignore", "README.md", "LICENSE", "CONTRIBUTING.md", "DESIGN.md", "RELEASING.md",
    "assets/logo.svg", "test/package.test.js",
  ]);
  await project.copyFiles(root, "src/**/*.js");
  await project.write("CHANGELOG.md", [
    "# Changelog", "", "## 0.1.0 (Next)", "",
    "- Exercise the release workflow.", "- Your contribution here.", "",
  ].join("\n"));
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const { eslint, "@eslint/markdown": markdown } = manifest.devDependencies;
  await project.write("package.json", JSON.stringify({
    ...manifest,
    version: "0.1.0",
    scripts: {
      test: "node --check src/index.js",
      lint: "node --check src/rules/no-unlinked-pages.js",
      "package:check": "node --test test/package.test.js",
    },
    devDependencies: { eslint, "@eslint/markdown": markdown },
    overrides: undefined,
  }));
  await project.run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  await project.commit();
  const released = "0.1.0";
  const workflow = createReleaseWorkflow(project.services);
  const prepared = await workflow.prepare({ ...project.options, version: released });
  assert.equal(await project.publisher.view(manifest.name, released), null);
  const result = await workflow.run({ ...project.options, version: released, env: prepared.runtime.env });
  assert.equal(result.verification, "verified");
  const releaseNotes = await project.remoteFile(`v${released}`, "CHANGELOG.md");
  assert.match(releaseNotes, /^## 0\.1\.0 \(\d{4}\/\d{2}\/\d{2}\)$/mu);
  assert.doesNotMatch(releaseNotes, /Your contribution here/u);
  assert.equal(JSON.parse(await project.remoteFile(`v${released}`, "package.json")).version, released);
  assert.match(await project.remoteFile("master", "CHANGELOG.md"),
    /^## 0\.1\.1 \(Next\)\n\n- Your contribution here\./mu);
  assert.equal(JSON.parse(await project.remoteFile("master", "package.json")).version, "0.1.1");
  const archive = await readFile(project.publisher.archive(manifest.name, released));
  assert.deepEqual(archive, await readFile(project.host.archive(manifest.name, released)));
  assert.deepEqual(archive, await readFile(join(project.artifacts, result.artifact.filename)));
  assert.equal(await project.git("status", "--porcelain"), "");
});
