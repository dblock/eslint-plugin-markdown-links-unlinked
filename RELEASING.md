# Releasing

These instructions are provisional: the package has not been published and no release automation exists yet. Publication, tags, GitHub Releases, authentication, and trusted-publisher setup each require explicit authorization; this document does not grant it.

## First Release

The first release, `0.1.0`, is published manually. Give `## 0.1.0 (Next)` real notes and a date, keep `package.json` and `package-lock.json` at `0.1.0`, and validate the exact archive:

```sh
npm ci
npm test
npm run lint
npm pack --json
PACKAGE_ARCHIVE=./eslint-plugin-markdown-links-unlinked-0.1.0.tgz npm run package:check
```

After authorization, publish that same file with interactive authentication, then verify the registry version and checksums against the archive and create the matching `v0.1.0` tag and GitHub Release:

```sh
npm publish ./eslint-plugin-markdown-links-unlinked-0.1.0.tgz --access public --ignore-scripts
npm view eslint-plugin-markdown-links-unlinked@0.1.0 version dist.integrity dist.shasum --json
```

## Later Releases

After the first release is verified, a focused PR will add a manually dispatched `release.yml` using [npm-package-release](https://github.com/dblock/npm-package-release) and npm Trusted Publishing through OIDC, without stored npm tokens. That PR will document the `release` environment, branch-protection changes, dispatch, verification, and recovery.

Never overwrite a published version or move an existing release tag.
