---
title: Phase 8
---

# Phase 8 Completion: React Compiler Validation and Documentation

Status: Complete on April 7, 2026

## Objective

Validate that Meridian-generated output remains correct under React Compiler-enabled builds and replace the placeholder React Compiler guide with a validated integration document.

## Delivered

- compiler-enabled Next.js fixture support through `fixtures/next-app-router/next.config.ts`
- local build command: `pnpm build:fixture:next:react-compiler`
- local runtime command: `pnpm test:fixture:next-runtime:react-compiler`
- shared browser runtime harness reused across baseline and compiler-enabled validation
- dedicated GitHub Actions workflow at `.github/workflows/react-compiler.yml`
- rewritten [guide/react-compiler.md](/guide/react-compiler)

## What Phase 8 now validates

- Meridian generation still succeeds before the Next.js build
- `next build` succeeds with `reactCompiler: true`
- the same Meridian-generated client child still hydrates and responds to interaction under `next dev`
- the Meridian-generated chunk remains minimal and does not grow explicit `useMemo` / `useCallback` helpers

## Important Decisions

- The validation target remains the existing Next.js App Router fixture. Phase 8 does not create a second app.
- The fixture gates compiler enablement via an environment variable so both baseline and compiler-enabled modes exercise the same app and the same Meridian output.
- Compatibility is defined by build success and runtime parity, not by depending on a specific Turbopack output signature.

## Commands

Local:

```sh
pnpm build:fixture:next:react-compiler
pnpm test:fixture:next-runtime:react-compiler
```

CI:

- `.github/workflows/react-compiler.yml`

## Documentation Outcome

[guide/react-compiler.md](/guide/react-compiler) now documents:

- Meridian vs React Compiler responsibilities
- the validated Next.js path and versions
- exact local validation commands
- the current support boundary
- the fact that Meridian correctness does not depend on React Compiler

## Remaining Work

Phase 8 is done. The remaining roadmap work is Phase 9 release hardening.
