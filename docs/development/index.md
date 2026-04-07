---
title: Development Plan
---

# Development Plan

This section breaks the remaining Meridian v1 work into execution documents that can be implemented independently without drifting from the root-level `rfc.md` and `implementation-plan.md`.

The remaining work is:

1. [Phase 9: v1 Hardening and Release Preparation](./phase-9-release.md)

Recently completed:

1. [Phase 3 Completion: Strict Mode Render Validation](./phase-3-strict-mode.md)
2. [Phase 6 Completion: CLI Watch and Incremental Rebuilds](./phase-6-cli-watch.md)
3. [Phase 7 Completion: Next.js Runtime Validation](./phase-7-next-runtime.md)
4. [Phase 8 Completion: React Compiler Validation and Documentation](./phase-8-react-compiler.md)

## Ordering

The recommended implementation order is:

1. start release prep only after the earlier verification work is green

## Working Rules

- Do not broaden the public API while these phases are in flight.
- Prefer tests and diagnostics over new runtime behavior.
- Keep generated output minimal and idiomatic; do not add memoization or scheduling APIs unless required by a validated React Compiler or framework integration need.
- Keep Next.js integration explicit through generated output. Meridian source should not become a new server-component execution model.
