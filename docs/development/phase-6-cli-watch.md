---
title: Phase 6 Completion
---

# Phase 6 Completion: CLI Watch and Incremental Rebuilds

## Objective

Finish the CLI work by making `meridian watch` testable, reliable, and meaningfully incremental for v1.

This phase focuses on:

- `packages/cli/src/watch.ts`
- `packages/cli/src/build.ts`
- `packages/cli/src/config.ts`

## Current State

Implemented:

- `meridian build` compiles source under `src/`
- excluded directories and output-dir loops are filtered
- watch mode is debounced
- watch mode rebuilds changed files incrementally where the event can be classified safely
- source-file deletion removes generated outputs
- watch behavior is covered by automated tests

Explicit v1 decision:

- source maps are deferred for v1 and are not emitted for generated files

## Scope

In scope:

- refactor watch mode for testability
- add watch-mode integration tests
- improve rebuild granularity to file-level where feasible
- define whether source maps are in or out for v1 and implement or explicitly defer

Out of scope:

- native SWC transforms
- long-lived daemon architecture
- bundler plugins

## Target v1 Behavior

`meridian watch` now:

1. perform an initial build
2. watch the configured source subtree
3. ignore output directories, hidden caches, and excluded directories
4. rebuild only affected files where possible
5. remove generated outputs when source files are deleted
6. print stable diagnostics without entering rebuild loops

V1 does not need a full compiler graph cache. File-level rebuild tracking is sufficient, and ambiguous events still fall back to a full rebuild.

## Implementation Notes

### 1. Watch orchestration is split from raw `fs.watch`

Refactor `watch.ts` into smaller pieces:

- path filtering
- change classification
- debounce scheduling
- rebuild execution
- watcher lifecycle / cleanup

Recommended internal shape:

- `createWatchController(config, deps)`
- `classifyChange(filePath, eventType, config)`
- `runIncrementalBuild(changedPaths, config)`

Inject `fs.watch` and timers through a thin dependency interface so the watch layer can be tested without relying on real filesystem races.

### 2. Source-to-output mapping is shared with build mode

The build path logic is currently embedded in `build.ts`. Extract reusable helpers for:

- source file eligibility
- Meridian module detection
- output path derivation
- passthrough copy path derivation

The watch path should use the same mapping code as full builds. Do not duplicate path logic.

### 3. File-level rebuilds and deletions are supported

For changed source files:

- recompile only the changed Meridian module
- rewrite only that output file
- copy only the changed passthrough asset when passthrough is enabled

For deleted source files:

- delete the corresponding generated output
- delete copied passthrough outputs when relevant

For directory changes or ambiguous events:

- fall back to a full rebuild

This fallback is important. Correctness is more important than minimal rebuild work.

### 4. Source maps are deferred for v1

The CLI config keeps a `sourceMaps` field for future expansion, but generated Meridian files do not emit source maps in v1. This is an explicit deferral, not an accidental omission.

## Test Plan

Implemented in `packages/cli/src/watch.test.ts`.

Required cases:

1. **Initial build runs once**
   - start watch mode against a temp project
   - assert one initial build occurs

2. **Change in a Meridian source file rebuilds that file**
   - modify one `.meridian.tsx` source
   - assert the generated output changes
   - assert unrelated outputs do not need to be regenerated

3. **Ignored output changes do not trigger loops**
   - touch a file under `.meridian/generated`
   - assert no rebuild fires

4. **Excluded directory changes are ignored**
   - touch a file under `node_modules`, `.next`, or another excluded dir
   - assert no rebuild fires

5. **Source deletion removes generated output**
   - delete a Meridian source file
   - assert the generated output is removed

6. **Invalid source reports diagnostics and recovers**
   - introduce an invalid Meridian source
   - assert diagnostics are printed
   - fix the file
   - assert watch mode recovers and rewrites valid output

Use temp directories and real files for integration realism, but inject watcher/timer dependencies where that makes tests deterministic.

## Acceptance Criteria

Phase 6 is complete when:

- watch mode has automated tests
- changed files rebuild without full-tree churn in the common case
- generated outputs are removed on deletion
- output-dir changes do not create rebuild loops
- diagnostics remain stable across invalid -> valid transitions
- the source map decision is explicit and documented

## Failure Modes to Avoid

- treating `fs.watch` event shapes as stable across platforms without normalization
- re-implementing separate path logic in watch mode
- making file-level rebuild mandatory for all events instead of using a safe fallback
- leaving temp-file cleanup or watcher cleanup to chance in tests
