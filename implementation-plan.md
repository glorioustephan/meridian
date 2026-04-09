# Meridian Implementation Plan

This document translates [rfc.md](./rfc.md) into a concrete, status-aware implementation plan for Meridian v1.

Status date: April 7, 2026

All implementation is assumed to be in TypeScript, using ESM modules and strict type-checking throughout.

---

## 1. Goals

Meridian v1 should deliver the narrowed contract defined in the RFC:

- class-shaped authoring for client React components
- `Component<Props>` and `Primitive<T>` as the public model
- compile-time lowering only
- static dependency inference only
- explicit `'use client'` module boundaries
- compatibility with React 19 and Next.js App Router through generated standard React code

Meridian v1 should not attempt to ship:

- runtime Proxy tracking
- `ServerComponent`
- `Resource<T>`
- decorated inheritance
- class decorators
- `@context`, `@id`, `@transition`
- `@state.deferred`, `@state.optimistic`, `@state.external`, `@state.reducer`
- native SWC or Turbopack transforms

---

## 2. Current Status

The repo is no longer at the “initial scaffold” stage. The current implementation already covers most of the v1 compiler path.

### Verified today

- `pnpm clean`
- `pnpm build`
- `pnpm test`
- `pnpm smoke:compiler-dist`
- `pnpm build:fixture:next`
- `pnpm build:fixture:next:react-compiler`
- `pnpm pack:smoke`
- `pnpm verify:release`
- `pnpm test:fixture:next-runtime`
- `pnpm test:fixture:next-runtime:react-compiler`
- `pnpm --dir docs build`

### Implemented

- workspace package split across `meridian`, `@meridian/compiler`, and `@meridian/cli`
- marker runtime API with uncompiled-source guard errors
- AST-backed parse -> validate -> lower compiler pipeline
- explicit diagnostics for unsupported v1 patterns
- component lowering for `@state`, `@ref`, getters, plain methods, and `render()`
- effect lowering for `@effect` and `@effect.layout` with static dependency inference
- primitive lowering and `@use(...)` wiring
- CLI build and watch commands
- real Next.js App Router fixture that consumes generated output
- Next.js runtime validation under `next dev`
- React Compiler-enabled build and runtime validation
- release-hardened package metadata and filtered tarball contents
- clean release verification path from a clean checkout
- changeset-based versioning workflow and release documentation
- fresh-install tarball smoke testing with installed CLI/compiler/application packages
- CI workflows for package verification, Next runtime validation, and React Compiler validation

### Not finished

- none for the current v1 roadmap

---

## 3. Repository Plan

The repo structure should now be described as it exists, not as a blank-slate target.

```text
/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  tsconfig.json
  vitest.config.ts
  scripts/
    smoke-compiler-dist.mjs
  packages/
    meridian/
      src/
        index.ts
        component.ts
        primitive.ts
        decorators.ts
        errors.ts
        types.ts
    compiler/
      src/
        index.ts
        compile.ts
        diagnostics.ts
        ir.ts
        ast.ts
        validate.ts
        parser/
        analyze/
        transform/
    cli/
      src/
        index.ts
        build.ts
        watch.ts
        config.ts
  fixtures/
    basic-counter/
    primitive-debounce/
    invalid-dynamic-deps/
    invalid-private-reactive/
    invalid-inheritance/
    invalid-server-component/
    next-app-router/
  .github/
    workflows/
      ci.yml
      next-runtime.yml
      react-compiler.yml
```

### Package roles

- `packages/meridian`: author-facing package with base classes, decorator factories, shared types, and runtime guards
- `packages/compiler`: AST parser, semantic validator, IR builder, and React code generator
- `packages/cli`: precompile command used before `next dev` or `next build`

### Technical defaults

- package manager: `pnpm`
- module format: ESM
- TypeScript mode: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- test runner: `vitest`
- AST stack: `@babel/parser`, `@babel/types`, `@babel/generator`

The compiler is the product. The runtime package should remain deliberately small.

---

## 4. Current Contracts

This section replaces the older string-backed IR sketch with the contracts Meridian actually relies on today.

### Public API

Supported v1 authoring API:

- `Component<Props>`
- `Primitive<T>`
- `@state`
- `@ref`
- `@effect`
- `@effect.layout`
- `@use`

Deferred APIs remain deferred and should stay out of the public surface.

### Compiler pipeline

The compiler currently follows this order:

1. Parse source into AST-backed module IR
2. Validate semantics and collect diagnostics
3. Analyze dependency graphs
4. Lower valid declarations into standard React TSX

Lowering only runs on valid IR.

### IR shape

The IR is AST-backed, not string-backed:

- fields carry initializer expressions
- methods and getters carry `BlockStatement` bodies
- method and constructor params preserve declared syntax
- module IR includes local-class metadata for inheritance validation

The declaration contract is one Meridian declaration per source module in v1.

### Diagnostics

The active diagnostic set is:

- `M001` missing `'use client'`
- `M002` decorated inheritance
- `M003` unsupported decorator
- `M004` `ServerComponent` authoring
- `M005` `@raw`
- `M006` missing `render()`
- `M007` missing `resolve()`
- `M008` dynamic dependency access
- `M009` multiple Meridian declarations per module
- `M010` reactive `#private` usage
- `M011` unsupported or unresolved `@use(...)`
- `M012` unsupported state mutation form

---

## 5. Phase Plan

The original phase order still makes sense, but the statuses have changed. The work below is split into completed, mostly complete, and remaining phases.

### Phase 0 - Workspace and Tooling Foundation

Status: Complete

Delivered:

- pnpm workspace
- TypeScript project references
- package skeletons
- strict base tsconfig
- Vitest setup
- fixture directories

Exit gate:

- `pnpm install`
- `pnpm build`
- `pnpm test`

### Phase 1 - Public API Scaffold

Status: Complete

Delivered:

- strongly typed `Component<Props>` and `Primitive<T>`
- marker decorators
- uncompiled execution guard
- public exports from `packages/meridian/src/index.ts`

### Phase 2 - AST Parsing and Semantic Validation

Status: Complete

Delivered:

- `.ts` / `.tsx` parsing
- `'use client'` detection
- Meridian class discovery
- AST-backed IR extraction
- semantic validation
- explicit diagnostic codes through `M012`

Notes:

- the current implementation is stricter than the original phase text
- multiple Meridian declarations are now rejected deterministically

### Phase 3 - Component Lowering

Status: Complete

Delivered:

- `@state` lowering
- `@ref` lowering
- getter lowering
- method lowering
- syntax-aware `this` rewriting
- renderer-backed tests that execute compiled output under `React.StrictMode`
- structural assertions that generated components do not retain a runtime class instance
- `render()` lowering

Remaining:

- add real render-level tests under React Strict Mode
- prove behavior with a renderer instead of string-output-only checks

Exit criteria for full completion:

- the counter example lowers to valid React TSX
- generated code renders correctly in tests
- Strict Mode test proves state lives in hooks, not on a retained class instance

### Phase 4 - Effect Lowering and Static Dependency Inference

Status: Complete

Delivered:

- `@effect` lowering to `useEffect`
- `@effect.layout` lowering to `useLayoutEffect`
- direct `this.props.x` and `this.stateField` tracking
- recursive getter flattening
- dynamic-access rejection
- async effect lowering through inner async functions

Known v1 behavior:

- dynamic access fails instead of falling back
- reactive private reads fail instead of compiling

### Phase 5 - Primitive and `@use` Lowering

Status: Complete

Delivered:

- primitive lowering to custom hooks
- constructor parameter capture
- primitive-local state/getter/effect lowering
- `resolve()` hook return value
- top-level `@use(...)` hook calls in source order

Remaining:

- none required for v1 core

### Phase 6 - CLI and Precompile Pipeline

Status: Complete

Delivered:

- `meridian build`
- `meridian watch`
- generated output rooted at `.meridian/generated`
- source subtree defaults
- excluded-directory handling
- configurable passthrough copying
- build-failing diagnostics
- watch-mode tests
- file-level rebuilds for common change/delete cases
- full-rebuild fallback for ambiguous watcher events

Remaining:

- none required for v1 core

Clarification:

- the current watch implementation is debounced, filtered, and incremental at the file level where safe
- Meridian does not emit source maps in v1; source-map support is explicitly deferred

### Phase 7 - Next.js App Router Fixture

Status: Complete

Delivered:

- real App Router fixture in `fixtures/next-app-router`
- Meridian client child imported from generated output
- explicit `'use client'` Meridian module
- successful `next build`
- documented precompile + Next workflow
- explicit fixture development scripts for Meridian watch + `next dev`
- browser-driven runtime validation against `next dev`
- hydration assertions for the generated Meridian client child
- separate GitHub Actions workflow for the runtime browser job

Remaining:

- none required for v1 core

### Phase 8 - React Compiler Validation and Stabilization

Status: Complete

Delivered:

- compiler-enabled Next.js fixture path through `MERIDIAN_REACT_COMPILER=1`
- local compiler-enabled build and runtime scripts
- browser runtime validation under `next dev` with the compiler-enabled app
- dedicated React Compiler GitHub Actions workflow
- rewritten [docs/guide/react-compiler.md](./docs/guide/react-compiler.md) grounded in the validated Next.js path

Notes:

- validation is defined as build success and runtime parity under the compiler-enabled app
- Meridian still emits minimal generated React and does not add `useMemo` or `useCallback` by default
- compatibility claims remain intentionally narrow to the validated Next.js App Router path

### Phase 9 - v1 Hardening and Release Prep

Status: Complete

Delivered:

- publishable package metadata for `meridian`, `@meridian/compiler`, and `@meridian/cli`
- package README files, root license, root changelog, and documented release process
- clean-first package builds and a root `verify:release` workflow
- tarball inspection and fresh-install smoke validation via `pnpm pack:smoke`
- install and usage docs aligned with the actual package names and CLI behavior
- CI coverage for tarball smoke testing in the main verification workflow

Notes:

- the root workspace package is now explicitly private and distinct from the publishable `meridian` package
- Phase 9 uses changesets for prerelease versioning workflow, with the repo documented around the first `0.1.0-alpha.0` release candidate

---

## 6. Test Matrix

This section tracks both current coverage and missing coverage.

### Currently covered

- IR extraction for valid `Component` modules
- IR extraction for valid `Primitive` modules
- decorator recognition
- dependency graph resolution
- mutation rewrite for direct state assignment
- negative diagnostics for:
  - dynamic dependency inference
  - decorated inheritance
  - reactive `#private` usage
  - `@raw`
  - `ServerComponent`
  - missing `'use client'`
  - missing `render()`
  - missing `resolve()`
  - multiple Meridian declarations
  - invalid `@use(...)`
- generated output tests for:
  - basic counter lowering
  - layout effect lowering
  - primitive debounce-style lowering
  - top-level hook ordering through component and primitive lowering tests
- CLI build integration
- Next.js App Router build integration
- Next.js App Router dev/hydration runtime validation
- built-compiler smoke test

### Still missing

- none required for the current v1 roadmap

---

## 7. Plan and RFC Alignment

The plan should stay narrower than earlier drafts and match the RFC exactly where v1 boundaries matter.

### Aligned with the RFC

- classes are authoring syntax, not runtime identity
- dependency inference is static or the build fails
- client boundaries are explicit at the module level
- `Primitive<T>` is the reusable hook abstraction
- `ServerComponent` and `Resource<T>` remain deferred
- generated output is minimal idiomatic React code

### Places the old plan drifted and are now corrected

- the old plan described string-backed IR; the implementation is AST-backed
- the old plan stopped diagnostics at `M008`; the implementation now uses `M001` through `M012`
- the old plan treated multi-declaration handling as optional; v1 now rejects it directly
- the old plan described a future `codegen/` layer that does not exist in the repo; current code lives under `transform/`

### Remaining delta from the RFC

- no material delta remains for the current v1 scope

---

## 8. Phase Gates

These rules still apply:

- do not start `Resource<T>` before a separate RFC
- do not start `ServerComponent` authoring before Meridian's client story is fully proven
- do not add runtime dependency tracking if static inference becomes painful; add diagnostics first
- do not add decorator modifiers for advanced React hooks in v1
- do not start a native SWC transform before the compiler package, CLI, and React Compiler validation are stable

Additional gate:

- keep future work out of the current v1 contract unless it is covered by a new RFC

---

## 9. Immediate Next Work

The current implementation-plan roadmap is complete.

Any subsequent work should start from a new scoped plan or RFC rather than extending the original v1 implementation phases.
