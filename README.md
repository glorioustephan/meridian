# Meridian

Meridian is an active prototype for a class-first authoring layer for React.

The active design document is [rfc.md](./rfc.md). It narrows Meridian v1 to a technically defensible scope:

- compile-time lowering only
- `Component<Props>` and `Primitive<T>` as the core public model
- explicit `'use client'` module boundaries
- React 19 + Next.js App Router interoperability
- no runtime Proxy tracking, custom server-component model, or reactive inheritance in v1

The implementation roadmap is [implementation-plan.md](./implementation-plan.md).

Verification entrypoints:

- `pnpm build` builds the Meridian workspace packages
- `pnpm test` runs the compiler and CLI test suite
- `pnpm smoke:compiler-dist` verifies the built compiler package is executable
- `pnpm build:fixture:next` compiles and builds the real Next.js App Router fixture

The Next.js fixture lives in [fixtures/next-app-router](/Users/leebaker/Playground/meridian/fixtures/next-app-router) and demonstrates the explicit generated-output integration flow required by the v1 RFC.
