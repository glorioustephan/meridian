# Meridian Implementation Plan

This document translates [rfc.md](./rfc.md) into a concrete, status-aware implementation plan for Meridian v1.

Status date: April 6, 2026

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

- `pnpm build`
- `pnpm test`
- `pnpm smoke:compiler-dist`
- `pnpm build:fixture:next`
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
- CI workflow for package build, tests, built-package smoke check, and Next fixture build

### Not finished

- `next dev` and hydration/runtime validation for the Next fixture
- React Compiler-enabled validation
- release prep, packaging, docs hardening, and alpha publication work

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

Status: Mostly complete

Delivered:

- real App Router fixture in `fixtures/next-app-router`
- Meridian client child imported from generated output
- explicit `'use client'` Meridian module
- successful `next build`
- documented precompile + Next workflow

Remaining:

- validate `next dev`
- validate hydration/runtime behavior in-browser

### Phase 8 - React Compiler Validation and Stabilization

Status: Not started

Objective:

- prove generated Meridian output remains correct under React Compiler-enabled builds
- document React Compiler positioning beyond the RFC summary

Planned deliverables:

- fixture or example build with React Compiler enabled
- compatibility notes in docs
- confirmation that Meridian correctness does not depend on generated memoization

Current signal:

- Meridian already emits plain derived expressions and local functions instead of default `useMemo` or `useCallback`
- [docs/guide/react-compiler.md](./docs/guide/react-compiler.md) still needs real content

### Phase 9 - v1 Hardening and Release Prep

Status: Not started

Objective:

- turn the prototype into a reproducible v1 alpha

Planned deliverables:

- stable docs for install and usage
- release packaging for all packages
- changelog and versioning policy
- more regression fixtures
- clean example-from-scratch workflow

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
- built-compiler smoke test

### Still missing

- `next dev` validation
- hydration/runtime interaction tests for the Next fixture
- React Compiler-enabled build validation

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

- the RFC calls for correctness under React Compiler-enabled builds; that validation has not been implemented yet
- the RFC calls for a Next.js App Router fixture; build-time coverage exists, but dev/hydration verification is still missing

---

## 8. Phase Gates

These rules still apply:

- do not start `Resource<T>` before a separate RFC
- do not start `ServerComponent` authoring before Meridian's client story is fully proven
- do not add runtime dependency tracking if static inference becomes painful; add diagnostics first
- do not add decorator modifiers for advanced React hooks in v1
- do not start a native SWC transform before the compiler package, CLI, and React Compiler validation are stable

Additional gate:

- do not broaden the public API until Phase 8 is complete and the current v1 behavior is documented

---

## 9. Immediate Next Work

The highest-value next sequence is:

1. validate `next dev` and hydration behavior for the Next fixture
2. implement React Compiler-enabled validation and documentation
3. begin release hardening only after the above are green

The next meaningful milestone is the completion of Phase 8: Meridian should have a proven compiler pipeline, proven Next.js App Router integration, and explicit evidence that React Compiler optimization does not change correctness.
