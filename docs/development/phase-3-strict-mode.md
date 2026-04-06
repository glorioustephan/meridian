---
title: Phase 3 Completion
---

# Phase 3 Completion: Strict Mode Render Validation

## Objective

Finish Phase 3 by proving, with a real renderer, that Meridian component state is owned by React hooks rather than a retained class instance.

This phase is not about changing code generation semantics. It is about validating the semantics that already exist in:

- `packages/compiler/src/compile.ts`
- `packages/compiler/src/transform/component.ts`
- `packages/compiler/src/transform/rewrite.ts`

## Current State

Already implemented:

- `@state` lowers to `useState`
- methods lower to lexical functions
- getters lower to local derived expressions
- `this.props` and direct state assignment are rewritten correctly

Missing proof:

- there is no render-level test under `React.StrictMode`
- there is no test that executes compiled output as a React component
- there is no regression test that catches an accidental return to retained-instance semantics

## Scope

In scope:

- add a renderer-backed compiler test harness
- run compiled Meridian output under `React.StrictMode`
- assert interactive updates still work
- assert generated code no longer depends on raw `this` references for stateful behavior

Out of scope:

- adding new compiler features
- changing the public API
- changing effect semantics

## Required Dependencies

Add the minimum tooling needed for renderer-backed tests at the root:

- `react`
- `react-dom`
- `@testing-library/react`
- `@testing-library/user-event`
- `jsdom`

Do not move the entire test suite to `jsdom`. Keep node as the default Vitest environment and opt into `jsdom` only for the new runtime tests.

## Implementation Strategy

### 1. Add a generated-module evaluation helper

Create a reusable helper under `packages/compiler/src/test-utils/` that:

1. accepts Meridian source
2. compiles it with `compileModule(...)`
3. transpiles emitted TSX to executable ESM using `typescript.transpileModule(...)`
4. loads the transpiled module with dynamic `import()` from a `data:` URL or temporary file
5. returns the default export or named hook/function for use in tests

The helper must:

- fail loudly if compilation emits diagnostics
- preserve JSX and type-lowering semantics consistent with the package build
- provide `React` and `react/jsx-runtime` through normal module resolution, not string substitution

### 2. Add Strict Mode component tests

Create a new test file, for example:

- `packages/compiler/src/runtime/strict-mode.test.tsx`

Recommended cases:

1. **Basic counter**
   - compile a Meridian counter component with `@state count = this.props.initial`
   - render it inside `<StrictMode>`
   - click the button
   - assert the count increments correctly

2. **Getter-backed rendering**
   - compile a component with `get doubled()`
   - assert the rendered derived value updates after state changes

3. **Method parameter handling**
   - compile a component with a method like `increment(step: number)`
   - invoke it via JSX
   - assert the update uses the declared parameter correctly

4. **No retained class instance dependence**
   - assert the emitted output does not contain `this.count`, `this.increment`, or similar stateful instance references
   - combine that assertion with a real render to ensure the runtime path is the generated function, not a string-only artifact

### 3. Add a regression test for disallowed state ownership models

Add one test that specifically guards against regressions in compiler architecture:

- compile a simple component
- inspect the emitted output
- assert there is no synthesized runtime instance, proxy import, or class reification step

This should be a structural assertion, not a broad snapshot. Check for the absence of concrete anti-patterns:

- `new ClassName(`
- `Proxy(`
- retained `this.` state access in lowered stateful paths

## Vitest Configuration

Keep the existing Vitest configuration node-first. For runtime tests:

- use `// @vitest-environment jsdom` at the top of the new test file, or
- create a narrow `environmentMatchGlobs` rule for `runtime/*.test.tsx`

Do not switch all compiler tests to a DOM environment.

## Test Design Constraints

- Do not snapshot entire compiled modules. Assert on the specific behavior and code patterns that matter.
- Prefer `screen.getByRole(...)` and user interactions over direct DOM query internals.
- Make the tests resilient to harmless formatting differences in emitted code.
- Use source examples that mirror the RFC’s supported surface only.

## Exit Criteria

Phase 3 is complete when all of the following are true:

- renderer-backed tests pass under `React.StrictMode`
- interactive state updates work from compiled Meridian output
- derived getter rendering updates correctly after state changes
- the tests prove state ownership lives in hooks, not a retained class instance
- the existing string-output compiler tests still pass

## Failure Modes to Avoid

- a test harness that evaluates TypeScript in a way the real package build never does
- broad snapshots that lock in formatting noise
- a jsdom migration for the entire suite
- introducing `useMemo` or `useCallback` merely to make tests pass
