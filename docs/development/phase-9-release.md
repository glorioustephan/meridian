---
title: Phase 9
---

# Phase 9 Completion: v1 Hardening and Release Preparation

Status: Complete on April 7, 2026

## Objective

Turn the validated prototype into a reproducible v1 alpha that can be installed from packed tarballs, verified from a clean checkout, and prepared for publication without leaking workspace-only assumptions.

## Delivered

- publishable metadata on `meridian`, `@meridian/compiler`, and `@meridian/cli`
- package README files plus root `LICENSE`, `CHANGELOG.md`, and `RELEASING.md`
- clean-first package build scripts and a root `pnpm verify:release` command
- tarball inspection plus fresh-install smoke validation through `pnpm pack:smoke`
- install and usage docs aligned with the actual package names and CLI behavior
- CI coverage for tarball smoke testing in the main verification workflow

## What Phase 9 validates

- package tarballs include filtered publishable contents only
- `dist/` is rebuilt from a clean state without stale test artifacts
- the packed CLI, compiler, and authoring package can be installed into a fresh temp project
- the installed CLI can compile a small multi-file Meridian component tree outside the workspace
- the docs and release instructions match the real shipped workflow

## Important Decisions

- The root workspace package is private and renamed away from the publishable `meridian` package to avoid release confusion.
- Changesets is used for prerelease versioning workflow, while the root `CHANGELOG.md` remains the human-readable release log.
- The public v1 CLI remains flag-driven; the docs no longer promise an undocumented `meridian.config.ts` file format.

## Commands

Local:

```sh
pnpm pack:smoke
pnpm verify:release
```

CI:

- `.github/workflows/ci.yml`

## Documentation Outcome

The release-facing docs now cover:

- real package names and install commands
- the precompile workflow for Next.js
- clean-check-release verification
- prerelease versioning and publish steps

## Remaining Work

Phase 9 is done. The original Meridian v1 implementation-plan roadmap is complete.
