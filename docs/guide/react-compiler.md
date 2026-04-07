---
title: React Compiler
---

# React Compiler

Meridian and the [React Compiler](https://react.dev/learn/react-compiler) solve different problems.

Meridian is an authoring transform. It turns class-shaped Meridian source into ordinary React function components and hooks.

React Compiler is an optimization pass over those generated function components. It can reduce unnecessary recomputation and memoization work, but Meridian does not depend on it for correctness.

## Positioning

As of April 7, 2026, Meridian’s validated React Compiler path is:

- Next.js `16.2.2`
- React `19.2.0`
- `babel-plugin-react-compiler` `1.0.0`
- `reactCompiler: true` in `next.config.ts`

Meridian does not try to compete with React Compiler and it does not emit memoization helpers preemptively.

## How they fit together

```
Meridian source (.tsx)
    ↓ meridian build (compile-time transform)
Generated React TSX
    ↓ React Compiler (bundler-time optimization)
Optimized React code
    ↓ next build
Production bundle
```

Meridian handles authoring ergonomics and static validation. React Compiler handles optimization. Neither depends on the other for correctness.

## What Meridian emits

Meridian’s code generation is deliberately minimal:

- Getters lower to plain `const` expressions, not `useMemo`
- Methods lower to plain local functions, not `useCallback`
- Effects emit dependency arrays that Meridian can prove statically, but Meridian does not add memoization wrappers around those dependencies

This is intentional. Manual `useMemo` and `useCallback` in generated code would add noise, duplicate work, and make Meridian harder to reason about. Meridian correctness does not depend on memoization.

## Enabling the React Compiler in Next.js

The current Next.js configuration path is documented at [next.config.js: reactCompiler](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler). React’s installation guide also points Next.js users back to the framework docs for the supported setup path: [React Compiler installation](https://react.dev/learn/react-compiler/installation).

Install the plugin:

```bash
pnpm add -D babel-plugin-react-compiler
```

Then enable React Compiler in `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;
```

In Meridian’s validated fixture, this is gated behind `MERIDIAN_REACT_COMPILER=1` so the same app can be exercised in both baseline and compiler-enabled modes:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig =
  process.env.MERIDIAN_REACT_COMPILER === '1'
    ? { reactCompiler: true }
    : {};

export default nextConfig;
```

## What Meridian validates today

Phase 8 validates two things:

1. The official Next.js React Compiler path can be enabled on a Meridian fixture and `next build` still succeeds.
2. The same Meridian-generated client component still hydrates and behaves correctly under `next dev` with the compiler-enabled app.

Validated local commands:

```bash
pnpm build:fixture:next:react-compiler
pnpm test:fixture:next-runtime:react-compiler
```

The runtime test uses a real browser and checks:

- the page shell renders from the server
- the Meridian child hydrates without mismatch warnings
- clicking the Meridian counter still updates client state correctly

The build assertion also checks that the Meridian-generated client chunk remains minimal and does not acquire explicit `useMemo` or `useCallback` helpers as part of Meridian’s codegen strategy.

## Constraints

Current support is intentionally narrow:

- validated framework path: Next.js App Router
- validated configuration: top-level `reactCompiler: true`
- validated outcome: build success and runtime parity under the compiler-enabled app

Meridian does not currently promise:

- framework-agnostic React Compiler validation
- annotation-mode specific guidance
- compiler-specific directives in Meridian source
- a stable build-artifact signature from Next.js/Turbopack output

That last point matters. React’s generic compiler docs show `react/compiler-runtime` markers in transformed output, but Next.js/Turbopack does not expose a stable artifact pattern Meridian can rely on here. Meridian’s automation therefore treats build success plus runtime parity as the compatibility contract.

## When to use both

Use Meridian if you want the class-based authoring layer and compile-time diagnostics.

Use React Compiler if you want the ecosystem’s optimization layer on top of that generated code.

For many teams, React Compiler alone is enough. Meridian only adds value if the authoring model and stricter compile-time constraints are a deliberate product choice.

## Related

- [Introduction](./introduction.md) — the compilation pipeline overview
- [Components guide](./components.md) — what Meridian emits for each member type
- [Why Meridian](./why-meridian.md) — the decision to emit lean output
