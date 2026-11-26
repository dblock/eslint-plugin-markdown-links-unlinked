import { HookValidator, IntrideaChangelog, ReleaseWorkflow } from "npm-package-release";

/**
 * Creates the release workflow. Tests pass simulated services; releases use the defaults.
 * @param {object} [services] Replacement services for simulated releases.
 * @returns {ReleaseWorkflow} The configured workflow.
 */
export function createReleaseWorkflow(services = {}) {
  return new ReleaseWorkflow({
    changelog: new IntrideaChangelog(),
    validator: new HookValidator({
      async validateArtifact({ archive, run }) {
        await run("npm", ["run", "package:check"], {
          env: { PACKAGE_ARCHIVE: archive },
        });
      },
    }),
    ...services,
  });
}

export default createReleaseWorkflow();
