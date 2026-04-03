# Meridian

Meridian is a draft, class-first authoring layer for React. The current repo state is architecture-only.

The active design document is [rfc.md](./rfc.md). It narrows Meridian v1 to a technically defensible scope:

- compile-time lowering only
- `Component<Props>` and `Primitive<T>` as the core public model
- explicit `'use client'` module boundaries
- React 19 + Next.js App Router interoperability
- no runtime Proxy tracking, custom server-component model, or reactive inheritance in v1

The next implementation work should follow the test plan and constraints defined in [rfc.md](./rfc.md).
