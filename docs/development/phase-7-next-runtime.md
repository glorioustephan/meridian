---
title: Phase 7 Completion
---

# Phase 7 Completion: Next.js Runtime Validation

## Objective

Finish Phase 7 by validating the runtime developer workflow for the existing Next.js App Router fixture, not just the production build.

This phase extends the current fixture in:

- `fixtures/next-app-router`

The build path and runtime path are now both proven.

## Current State

Implemented:

- Meridian source compiles into `.meridian/generated`
- the fixture imports generated output rather than raw Meridian source
- `next build` succeeds
- fixture dev scripts make the two-process development model explicit
- `next dev` is exercised automatically against generated Meridian output
- hydration is checked in a real browser
- interactive client behavior after hydration is covered automatically

Still deferred:

- regeneration behavior while `next dev` stays running after the Meridian source changes

## Scope

In scope:

- add runtime validation scripts and tests for the existing fixture
- verify the generated Meridian child hydrates and responds to user input
- verify the fixture remains on the explicit generated-output integration path

Out of scope:

- introducing Meridian-specific Server Components
- building a custom Next plugin
- solving Fast Refresh or HMR comprehensively unless directly needed to prove the fixture workflow

## Target Validation Surface

The fixture should prove three things:

1. a standard App Router server page can import a generated Meridian client child
2. the page hydrates successfully in the browser
3. the Meridian child responds to user input after hydration

Optional stretch goal:

- confirm that editing the source component and rerunning Meridian generation is reflected in `next dev`

## Implementation Notes

### 1. The fixture exposes explicit dev-mode scripts

Extend the fixture package scripts with an explicit development path, for example:

- `dev:meridian`
- `dev:web`
- `dev`

The development flow should make the two-process model explicit:

1. Meridian generates output
2. Next.js serves the fixture

If you add a combined `dev` command, keep the composition simple and observable. A shell script or lightweight node runner is acceptable. Do not hide the fact that Meridian precompilation is a separate step.

### 2. Browser-driven runtime tests are implemented

Use browser automation for this phase. Playwright is the right level of realism.

Add a test harness that:

1. starts Meridian generation for the fixture
2. starts `next dev` on an ephemeral port
3. waits for readiness
4. opens the root page in a browser
5. asserts the page renders
6. clicks the Meridian counter button
7. asserts the count changes in the hydrated client component

Recommended test location:

- `fixtures/next-app-router/tests/`
- or a root-level test harness that treats the fixture as an external app

### 3. Hydration-specific assertions are part of the runtime test

Do not stop at “the text appears.” The runtime test should distinguish prerendered markup from hydrated behavior.

Minimum assertions:

- initial HTML contains the server-rendered page shell
- after hydration, clicking the button updates the counter text

Preferred additional assertion:

- inspect the browser console for hydration warnings and fail if any React hydration mismatch appears

### 4. Generated-output imports remain explicit

The runtime tests should verify the fixture still imports:

- `../.meridian/generated/...`

Do not allow the fixture to regress into importing Meridian source directly just because `next dev` can resolve local TypeScript.

## Implemented Test Matrix

Required:

1. **Build-time fixture**
   - keep the existing `next build` check

2. **Dev-time boot**
   - `next dev` starts successfully after Meridian generation

3. **Hydration**
   - the page loads without hydration warnings

4. **Interaction**
   - clicking the Meridian counter updates its rendered state

Deferred:

5. **Regeneration**
   - modify the Meridian source file
   - rerun Meridian generation
   - refresh the page
   - confirm the updated output is served

## CI Strategy

Do not put the slowest possible browser workflow into the main CI job immediately if it causes flakiness.

Implemented rollout:

1. keep `next build` in the main CI workflow
2. run browser validation in a separate `Next Runtime` workflow
3. promote it into the main required path later if desired

## Acceptance Criteria

Phase 7 is complete when:

- `next build` remains green
- `next dev` is exercised automatically
- the Meridian child hydrates and handles interaction
- the fixture still consumes generated output, not raw Meridian source
- developer workflow is documented in the fixture README or guide docs

## Failure Modes to Avoid

- conflating a successful static prerender with client hydration success
- silently allowing the fixture to import Meridian source directly
- hiding two-process dev behavior behind tooling that makes debugging impossible
- making the runtime test depend on Fast Refresh before basic hydration is proven
