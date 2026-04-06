---
title: Phase 8
---

# Phase 8: React Compiler Validation and Documentation

## Objective

Validate that Meridian-generated output remains correct under React Compiler-enabled builds and turn the current placeholder documentation into a real integration guide.

This phase primarily touches:

- [guide/react-compiler.md](/guide/react-compiler)
- the existing Next.js fixture or a closely related validation fixture
- CI or local verification scripts for compiler-enabled builds

## Current State

Already true in the implementation:

- getters lower to derived expressions or local helpers
- methods lower to local functions
- Meridian does not generate `useMemo` or `useCallback` by default
- correctness does not currently depend on manual memoization

Missing:

- proof under a compiler-enabled build
- documented guidance for how Meridian and React Compiler are meant to coexist

## Scope

In scope:

- enable a React Compiler-capable build for a Meridian-generated app
- verify that the build passes and behavior remains correct
- document the supported integration story

Out of scope:

- changing Meridian to emit memoization by default
- adding React Compiler-specific syntax to Meridian source
- promising support for undocumented or unstable framework internals

## Precondition

Before implementing this phase, verify the current official React Compiler enablement path for the chosen framework and version.

Do not guess the flag name, plugin shape, or config location from memory. The exact integration mechanism may move over time. Treat the official docs as the source of truth for the final implementation.

## Validation Strategy

### 1. Choose one authoritative validation path

Use one framework path first. The existing Next.js fixture is the best default because Meridian already has a working generated-output flow there.

Recommended approach:

- extend `fixtures/next-app-router` with a compiler-enabled variant, or
- add a sibling fixture that differs only by React Compiler configuration

The goal is to isolate the compiler variable, not to create a second unrelated app.

### 2. Prove build-time compatibility

Required checks:

- Meridian generation still succeeds
- the framework build succeeds with React Compiler enabled
- no Meridian codegen rule needs to change just to make the build pass

### 3. Prove runtime correctness

Reuse the runtime validation from Phase 7 where possible:

- load the page
- confirm hydration
- interact with the Meridian client child
- confirm behavior matches the non-compiler build

This prevents “build passes, runtime changes subtly” regressions.

### 4. Audit generated output assumptions

Once the compiler-enabled fixture is passing, perform a focused audit of Meridian output patterns:

- derived expressions
- local function handlers
- effect bodies and dependency arrays
- primitive hook lowering

The purpose of this audit is to confirm Meridian is emitting readable React that the React Compiler can optimize naturally. It is not to chase optimizer-specific patterns unless the official toolchain requires them.

## Documentation Work

Replace the placeholder content in [guide/react-compiler.md](/guide/react-compiler) with:

- Meridian’s positioning relative to React Compiler
- what Meridian does and does not optimize itself
- the recommended build order
- known constraints or caveats
- the exact fixture or command used to validate support

The guide should explicitly say:

- Meridian correctness does not depend on React Compiler
- React Compiler is an optional optimization layer over generated React code

## CI Strategy

Add compiler-enabled validation only after it is stable locally.

Recommended rollout:

1. add a dedicated local script
2. add a separate CI job or matrix target
3. keep it required only after repeated green runs

If compiler-enabled builds are materially slower, isolate them from the main fast verification job instead of slowing every PR by default.

## Acceptance Criteria

Phase 8 is complete when:

- at least one real fixture builds successfully with React Compiler enabled
- runtime behavior matches the non-compiler path for the validated fixture
- Meridian still emits minimal idiomatic React without default memoization helpers
- [guide/react-compiler.md](/guide/react-compiler) is fully authored
- the validation path is automated

## Failure Modes to Avoid

- enabling React Compiler in an ad hoc way that is not supported by official docs
- rewriting Meridian to emit `useMemo` or `useCallback` preemptively
- declaring broad compatibility from a single unverified build-only pass
- documenting assumptions that are not backed by an actual fixture
