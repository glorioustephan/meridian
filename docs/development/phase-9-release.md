---
title: Phase 9
---

# Phase 9: v1 Hardening and Release Preparation

## Objective

Turn the current prototype into a reproducible v1 alpha that can be installed, exercised from a clean checkout, and published without leaking internal artifacts or unfinished packaging assumptions.

This phase is about operational quality, not new language features.

## Current State

Already available:

- package builds
- tests
- built-package smoke check
- CI workflow
- working CLI and compiler path

Still missing:

- package publication metadata and packaging discipline
- install and usage documentation suitable for first external users
- versioning and changelog policy
- release-focused regression coverage

## Scope

In scope:

- package metadata and publish configuration
- release-quality docs
- tarball and install smoke tests
- artifact hygiene
- regression fixture expansion

Out of scope:

- new framework features
- v2 API design
- native framework plugins

## Workstreams

### 1. Package hygiene

Audit:

- `packages/meridian/package.json`
- `packages/compiler/package.json`
- `packages/cli/package.json`

Add or confirm:

- `license`
- `repository`
- `homepage`
- `bugs`
- `files`
- `publishConfig`
- appropriate `bin` exposure for the CLI
- clean `exports` maps

The `files` field is especially important. Published packages should include only the assets needed at runtime:

- `dist/`
- package metadata
- README and license files if desired

Do not publish tests, tsbuildinfo files, local fixtures, or stale build outputs.

### 2. Dist cleanliness and release build discipline

Add an explicit release build path that starts from a clean state.

Recommended tasks:

- ensure package-level clean scripts are used before release builds
- confirm `dist/` does not contain test files or stale outputs from earlier builds
- add a release verification script that runs:
  - clean
  - build
  - test
  - smoke checks

The current repo has already shown that stale `dist/` contents can survive between iterations. Release prep should make that impossible.

### 3. Install and usage documentation

Upgrade the docs so a new user can:

1. install Meridian packages
2. understand the precompile workflow
3. run a minimal example
4. understand the main unsupported v1 features

Target docs to audit and improve:

- [guide/installation.md](/guide/installation)
- [guide/quick-start.md](/guide/quick-start)
- [guide/nextjs.md](/guide/nextjs)
- `README.md`

The docs must describe the real workflow, including explicit generated-output integration and unsupported patterns.

### 4. Versioning and changelog policy

Choose a concrete release process.

Recommended baseline:

- semantic versioning
- prerelease tag for the first alpha
- changeset-based or equivalent changelog generation

Whichever mechanism is chosen, document:

- how versions are cut
- how changelogs are generated
- how packages are published
- what qualifies as breaking for Meridian v1

### 5. Tarball and fresh-install smoke tests

Add release verification that simulates real consumer usage.

Required checks:

1. run `pnpm pack` for each publishable package
2. install those tarballs into a temp directory or fixture project
3. verify:
   - the compiler can be imported
   - the CLI can execute
   - the `meridian` package resolves correctly

This step catches packaging mistakes that normal workspace tests do not.

### 6. Regression fixture expansion

Add a small set of release-grade regression fixtures beyond the current happy path:

- multi-file component trees using generated imports
- invalid `@use(...)` argument forms
- deletion/rebuild behavior once watch mode is completed
- any React Compiler-enabled fixture added in Phase 8

These fixtures should exist to protect release behavior, not to grow the feature set.

## Acceptance Criteria

Phase 9 is complete when:

- publishable packages have correct metadata and filtered package contents
- clean release builds do not emit stale test artifacts into `dist/`
- install docs match the actual workflow
- versioning and changelog policy are documented
- tarball install smoke tests pass
- the repo can be validated from a clean checkout without hand-edited steps

## Failure Modes to Avoid

- publishing workspace-only assumptions
- shipping test files or internal fixtures in package tarballs
- writing install docs that describe a future SWC/plugin story instead of the current precompile model
- cutting an alpha before Phase 8 validation exists
