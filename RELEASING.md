# Releasing Meridian

Meridian publishes three packages:

- `meridian`
- `@meridian/compiler`
- `@meridian/cli`

The release process is intentionally conservative. No package should be published unless the repository passes the full release verification path from a clean checkout.

## Versioning policy

- Meridian uses Semantic Versioning.
- While Meridian remains pre-1.0, all public releases use the `alpha` dist-tag.
- Breaking changes to the documented v1 API or generated-output contract still require a version bump and release notes, even during alpha.

## Changelog policy

- User-facing changes must be captured in a changeset before release.
- The root `CHANGELOG.md` is updated for each published release.
- Release notes should focus on author-facing behavior, diagnostics, packaging changes, and integration constraints.

## Release commands

From a clean checkout:

```sh
pnpm install
pnpm verify:release
```

If verification passes:

```sh
pnpm changeset
pnpm version:packages
pnpm verify:release
pnpm release:publish
```

## What `verify:release` covers

`pnpm verify:release` runs:

- clean workspace/package outputs
- package builds
- unit and integration tests
- built-compiler smoke test
- baseline Next.js fixture build and runtime validation
- React Compiler-enabled Next.js fixture build and runtime validation
- tarball packaging and fresh-install smoke validation
- docs build

## Publishing expectations

- Publish only from `main` after CI is green.
- Keep package metadata, README files, and `files` filters in sync with what is actually shipped.
- Do not publish workspace-only assumptions such as raw `src/` trees, test files, or stale `dist/` artifacts.
