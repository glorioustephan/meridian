# Meridian

### A Convention-Driven Meta-Framework for React

**Architecture RFC - v0.2**

Status: Draft  
Last revised: April 3, 2026

---

## 1. Thesis

React's hooks API still exposes too much mechanism in the render path. Authors have to manually manage dependency arrays, cleanup boundaries, callback stability, and the order-sensitive rules around hook calls. Meridian keeps the core thesis from v0.1: developers should be able to author React components in class-shaped, idiomatic TypeScript without writing hooks directly.

The revision in this RFC is structural. Meridian v1 is no longer framed as a runtime instance model with Proxy-powered reactivity. It is a **compile-time authoring layer** that lowers class syntax to standard React function components and custom hooks. The generated function owns the real state. The class is authoring syntax, not runtime identity.

That narrower claim is what makes Meridian technically credible on React 19 and Next.js App Router.

---

## 2. Design Principles

1. **Compile-time correctness over runtime cleverness.** Meridian should prefer transforms and diagnostics over hidden runtime behavior.
2. **Classes are syntax, not framework state.** The author writes a class, but React still owns rendering, state, refs, and effects.
3. **Explicit boundaries beat magical inference.** Client entrypoints are explicit at the module level in v1.
4. **Lean generated output wins.** Meridian should emit ordinary React code and let the React Compiler optimize it.
5. **A truthful v1 is better than a broad fantasy.** Unsupported patterns should fail loudly instead of being "sort of" supported.
6. **Adoption must be incremental.** Meridian components must coexist with ordinary React function components and Next.js Server Components.

---

## 3. Feasibility Findings

These findings are ordered by severity. They are the reason v0.2 narrows the surface area from the original RFC.

### 3.1 P0 - A persistent proxied class instance is not a safe source of truth

React's render model assumes that components and hooks are pure and can be re-run, restarted, or discarded safely during rendering and concurrent work. A live mutable class instance that survives outside the generated function creates a second state system with identity and mutation rules that React does not own. That is the wrong foundation for Strict Mode and concurrent rendering.

V1 therefore treats the class as authoring syntax only. `@state` lowers to `useState`, `@ref` lowers to `useRef`, `@effect` lowers to `useEffect`, and method bodies are rewritten against lexical state bindings. There is no runtime Meridian instance that carries the canonical data model.

Relevant sources:
- [React: Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure)

### 3.2 P0 - Proxy-based runtime dependency tracking is too late and too implicit

The v0.1 design relied on runtime property access tracking to synthesize dependency arrays. That approach is attractive, but it is the wrong core mechanism for a framework that claims predictable hook output and React Compiler compatibility.

Runtime tracking happens after the compiler has already committed to a hook topology. It is also much harder to reason about in the presence of concurrent rendering, closure capture, dynamic property access, and ref reads. V1 should use compile-time dependency inference only. When the compiler cannot resolve a dependency set statically, it should fail with an actionable build error. That is a cleaner contract than silently switching execution models.

### 3.3 P1 - Decorated inheritance is not a safe v1 feature

The original RFC promised hook flattening across a class hierarchy in deterministic order. That sounds elegant, but it multiplies the hard cases: field initializers that depend on `super`, overridden getters, overridden effects, method decorators on parent and child classes, and subtle ordering questions once hook-producing members exist in multiple levels.

V1 should not flatten decorated inheritance. A Meridian `Component` or `Primitive` may extend a non-reactive helper base class, but decorated members must live on the concrete class being compiled. Reusable reactive behavior belongs in `Primitive`, not in an inheritance chain.

### 3.4 P1 - Client/server boundaries are module-scoped, not class-scoped

The original RFC claimed Meridian could infer `'use client'` per class. That is not how React Server Components work. The `'use client'` directive marks a **module** and its transitive dependencies as client code. Next.js documents the same server/client split at the module boundary.

V1 must therefore make Meridian component modules explicit client entrypoints. A Meridian component file that compiles to hooks starts with `'use client'`. Meridian does not claim mixed server/client classes in a single source file.

Relevant sources:
- [React: 'use client'](https://react.dev/reference/rsc/use-client)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

### 3.5 P1 - Several React hooks do not map cleanly to a property-decorator model

`useDeferredValue`, `useOptimistic`, and `useTransition` are not alternate storage backends for `useState`. They encode scheduling and Action semantics that matter to author intent. React's own docs describe `useDeferredValue` as a deferred copy of another value and `useOptimistic` as temporary optimistic state during an Action. Flattening those into `@state.deferred` or `@state.optimistic` hides important behavior instead of clarifying it.

Those APIs should be deferred until Meridian has a design that makes the semantics obvious rather than merely hook-shaped.

Relevant sources:
- [React: useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [React: useOptimistic](https://react.dev/reference/react/useOptimistic)

### 3.6 P2 - The build-pipeline claims were too strong for a first release

The original RFC described a Babel plugin with an SWC adapter and broad React Server Components compatibility. That overstates what should be promised in v1.

Next.js uses the Next.js Compiler, written in Rust using SWC, and falls back to Babel for individual files when a custom Babel configuration is present. Separately, React notes that the underlying APIs used to implement an RSC bundler or framework do not follow semver in React 19.x. The practical conclusion is simple: v1 should promise generated React code plus a stable precompile path, not a native SWC/Turbopack implementation or a custom server-component framework story.

Relevant sources:
- [Next.js Compiler](https://nextjs.org/docs/architecture/nextjs-compiler)
- [React: Server Components](https://react.dev/reference/rsc/server-components)

---

## 4. Revised Architecture Overview

```
+--------------------------------------------------------+
| Developer Authoring                                    |
| Classes · Standard Decorators · Getters · Methods      |
| Component<Props> · Primitive<T>                        |
+-----------------------------+--------------------------+
                              |
                         Compile Time
                              |
                 +------------v------------+
                 | Meridian Compiler       |
                 | AST transform only      |
                 |                         |
                 | Classes -> Functions    |
                 | Decorators -> Hooks     |
                 | Primitive -> Hook fn    |
                 | Static dep analysis     |
                 +------------+------------+
                              |
                 +------------v------------+
                 | Generated React Code    |
                 | useState/useRef/effects |
                 | Plain expressions       |
                 +------------+------------+
                              |
                 +------------v------------+
                 | React Compiler          |
                 | Optional optimization   |
                 +------------+------------+
                              |
                 +------------v------------+
                 | Next.js / React Runtime |
                 +-------------------------+
```

### Compilation pipeline

1. Authors write Meridian components and primitives in TypeScript using standard decorators.
2. The Meridian compiler rewrites those classes into ordinary React function components and custom hooks.
3. The generated output is consumed by Next.js, Vite, or another bundler as normal React code.
4. The React Compiler may optimize the generated output, but Meridian does not depend on it for correctness.

### Integration model

- **Primary v1 path:** standalone precompile step that emits generated React source before `next dev` or `next build`.
- **Secondary path:** Babel plugin integration outside Next.js, where that is acceptable.
- **Deferred:** native SWC or Turbopack transforms.

This keeps Next.js on its normal compiler path for generated files while avoiding claims that Meridian already has a production-grade SWC story.

---

## 5. The v1 Component Model

### 5.1 Public base classes

| Base Class | Purpose | v1 Status |
| --- | --- | --- |
| `Component<Props>` | Interactive client component authored as a class | Supported |
| `Primitive<T>` | Reusable stateful logic that compiles to a custom hook | Supported |
| `ServerComponent` | Server-only class component model | Deferred |
| `Resource<T>` | Structured async data lifecycle | Deferred |

### 5.2 Supported member surface

| Member form | Meaning | Lowering |
| --- | --- | --- |
| `@state field = init` | Reactive mutable state | `useState` |
| `@ref field` | Mutable ref object | `useRef` |
| `@use(Primitive, args)` | Reusable stateful logic | Custom hook call |
| `get value()` | Pure derived value | Plain expression / local helper |
| `@effect method()` | Side effect with inferred deps | `useEffect` |
| `@effect.layout method()` | Layout effect with inferred deps | `useLayoutEffect` |
| Plain instance method | Event handler or local behavior | Local function |

`this.props` is readonly by default. Meridian methods are safe to reference from JSX because the compiler lowers them to lexical functions; there is no manual binding step.

### 5.3 Authoring example

```typescript
'use client';

import { Component, effect, state } from 'meridian';

export default class Counter extends Component {
  @state count = 0;

  get double(): number {
    return this.count * 2;
  }

  increment(): void {
    this.count = this.count + 1;
  }

  @effect
  trackLifecycle(): () => void {
    analytics.track('counter_mounted');
    return () => analytics.track('counter_unmounted');
  }

  render(): JSX.Element {
    return (
      <button onClick={this.increment}>
        {this.count} (x2: {this.double})
      </button>
    );
  }
}
```

### 5.4 Approximate generated output

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function Counter(props: {}) {
  const [count, setCount] = useState(0);

  const double = count * 2;

  function increment() {
    setCount(prev => prev + 1);
  }

  useEffect(() => {
    analytics.track('counter_mounted');
    return () => analytics.track('counter_unmounted');
  }, []);

  return (
    <button onClick={increment}>
      {count} (x2: {double})
    </button>
  );
}
```

The important point is not the exact emitted syntax. The important point is that the emitted code is normal React code with no Proxy runtime and no hidden instance identity.

---

## 6. Decorators and Dependency Rules

### 6.1 Property decorators

```typescript
'use client';

class SearchForm extends Component<{ initialQuery: string }> {
  @state query = this.props.initialQuery;
  @ref inputEl!: React.RefObject<HTMLInputElement>;

  render(): JSX.Element {
    return <input ref={this.inputEl} value={this.query} />;
  }
}
```

- `@state` fields are the only reactive mutable fields in v1.
- `@ref` fields lower to object refs and should be read through `.current`.
- `@use` attaches a `Primitive` return value to a field and lowers to a custom hook call.

### 6.2 Method decorators

```typescript
class MeasureBox extends Component {
  @ref boxEl!: React.RefObject<HTMLDivElement>;
  @state height = 0;

  @effect.layout
  measure(): void {
    this.height = this.boxEl.current?.getBoundingClientRect().height ?? 0;
  }

  render(): JSX.Element {
    return <div ref={this.boxEl}>{this.height}</div>;
  }
}
```

### 6.3 Static dependency inference

V1 dependency inference is compile-time only. The compiler may track:

- direct reads of `this.props.foo`
- direct reads of `this.someState`
- reads of other pure getters that recursively resolve to supported reads

V1 rejects patterns that undermine deterministic lowering, including:

- computed member access such as `this[key]`
- iterating over `this`
- effect bodies that depend on mutable closure state outside the class body
- mutation inside getters
- async getters
- reads from `#private` fields inside getters or decorated effect methods
- decorated inheritance

If the compiler cannot prove a dependency set, it stops and reports a build error. That is a deliberate v1 choice.

### 6.4 Cleanup model

V1 does **not** include `onMount()` and `onDismount()` conventions. Cleanup is returned directly from an `@effect` method, matching React's effect contract. The class-based lifecycle sugar from v0.1 is deferred until the lowering model is stable enough to support it cleanly.

---

## 7. Primitive Model

`Primitive<T>` is the Meridian abstraction for reusable stateful logic. A Primitive compiles to a custom hook. Like `Component`, it is authoring syntax only.

```typescript
import { Primitive, effect, state } from 'meridian';

export class UseDebounce<T> extends Primitive<T> {
  @state current: T;

  constructor(private value: T, private delay: number) {
    super();
    this.current = value;
  }

  @effect
  sync(): () => void {
    const timeoutId = setTimeout(() => {
      this.current = this.value;
    }, this.delay);

    return () => clearTimeout(timeoutId);
  }

  resolve(): T {
    return this.current;
  }
}
```

Consumed from a component:

```typescript
'use client';

class SearchPage extends Component {
  @state query = '';

  @use(UseDebounce, () => [this.query, 300])
  debouncedQuery!: string;

  render(): JSX.Element {
    return <SearchResults query={this.debouncedQuery} />;
  }
}
```

Primitive rules in v1:

- Primitives are client-side only.
- `resolve()` defines the hook return value.
- The args factory passed to `@use(...)` must be statically analyzable.
- Primitive hook order is deterministic because the compiler emits all `@use(...)` calls at the top level in source order.

---

## 8. Next.js and React Compiler Positioning

### 8.1 Next.js App Router

Meridian v1 does not introduce a new server component model. Standard Next.js Server Components remain ordinary async function components. They may import and render Meridian client components as children.

Example:

```typescript
// app/products/[id]/page.tsx
import ProductCounter from '@/components/ProductCounter';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);

  return (
    <main>
      <h1>{product.name}</h1>
      <ProductCounter productId={product.id} />
    </main>
  );
}
```

`ProductCounter` can be a Meridian `Component`, but the page itself remains a normal Server Component. This keeps Meridian aligned with Next.js instead of competing with it.

### 8.2 React Compiler

Meridian should emit minimal idiomatic React code and rely on the React Compiler where possible. In particular:

- getters lower to plain derived expressions or local helpers, not automatic `useMemo`
- instance methods lower to local functions, not automatic `useCallback`
- effects only emit dependency arrays that Meridian can prove statically

This is an inference from the current toolchain direction: Meridian should preserve correctness and readability first, then let the React Compiler optimize generated code where it can.

---

## 9. Unsupported in v1

The following features are explicitly out of scope for the first release:

- `ServerComponent`
- `Resource<T>`
- runtime Proxy tracking
- class decorators such as `@provider`, `@errorBoundary`, `@suspense`, `@memo`, and `@displayName`
- `@context(...)`
- `@id`
- `@transition`
- `@state.deferred`
- `@state.optimistic`
- `@state.external(...)`
- `@state.reducer(...)`
- convention lifecycle methods such as `onMount()`, `onDismount()`, `onUpdate()`, and `onLayout()`
- decorated inheritance and hook flattening across `extends`
- `@raw`
- reactive use of `#private` fields
- mixed server/client classes in one module
- native SWC or Turbopack transforms

These are deferred to future work, not silently half-supported.

---

## 10. Toolchain and Diagnostics

### 10.1 Decorators

V1 targets standard decorators in TypeScript 5.x and Babel's decorators support with `version: "2023-11"`.

Important constraint: the TypeScript 5.0 decorators model is not compatible with `--emitDecoratorMetadata`, and it does not support parameter decorators. Meridian should stay within the standard decorators model instead of depending on legacy decorator behavior.

Relevant sources:
- [TypeScript 5.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html)
- [Babel decorators plugin](https://babeljs.io/docs/babel-plugin-proposal-decorators)

### 10.2 Diagnostics

The compiler should fail with explicit messages for unsupported patterns. Minimum v1 diagnostics:

- "Dynamic dependency access is not supported in `@effect`."
- "Decorated inheritance is not supported in v1. Move reactive behavior into a Primitive."
- "Reactive reads from `#private` fields are not supported."
- "Meridian components must live in explicit client modules."
- "`ServerComponent` authoring is deferred in v1."

### 10.3 Precompile over deep framework coupling

The safest v1 integration is a precompile step that writes standard React output before Next.js compilation. That keeps Meridian's responsibility narrow and avoids promising a native SWC story too early.

---

## 11. Migration Path

Meridian remains incrementally adoptable.

- Start with leaf client components.
- Keep App Router pages, layouts, and data-loading components as standard Next.js Server Components.
- Use `Primitive` for reusable local stateful logic instead of reactive inheritance.
- Mix Meridian components and standard React components freely in the same tree.
- Do not promise a full codemod in v1. That is future work once the compiler contract is stable.

---

## 12. Test Plan

The first implementation milestone should validate the narrowed contract directly:

1. **Strict Mode state ownership**
   - Compile a basic `@state` + getter + method component.
   - Run it under React Strict Mode.
   - Confirm correctness does not depend on a persistent mutable instance.

2. **Primitive lowering**
   - Compile a `Primitive<T>` with `@state`, `@effect`, and `resolve()`.
   - Verify it becomes a custom hook with deterministic top-level hook order.

3. **Negative diagnostics**
   - Add fixture cases that fail with actionable errors for:
     - dynamic dependency inference
     - decorated inheritance
     - reactive `#private` usage
     - `@raw`
     - `ServerComponent` authoring

4. **Next.js App Router fixture**
   - Add a fixture where a standard Server Component parent imports a Meridian client child.
   - Verify the client boundary is explicit and the generated output works in Next.js App Router.

5. **React Compiler compatibility**
   - Run generated output through a React Compiler-enabled build.
   - Confirm correctness does not depend on Meridian emitting manual `useMemo` or `useCallback` by default.

---

## 13. Future Work

Features intentionally deferred beyond v1:

- convention lifecycle methods with separate mount and unmount sugar
- `ServerComponent` as a first-class Meridian base class
- `Resource<T>` and structured async cache primitives
- `@context(...)` and `@id`
- scheduling-aware APIs for `useTransition`, `useDeferredValue`, and `useOptimistic`
- class decorators that wrap output in providers, Suspense, or error boundaries
- explicit dependency annotation escape hatches, if static-only inference proves too strict
- reactive inheritance, if a defensible ordering model emerges
- native SWC and Turbopack transforms
- codemods, ESLint rules, DevTools labeling, and HMR-focused tooling

---

## 14. Summary

Meridian still aims for hookless authoring in React, but v1 must be smaller than the original RFC claimed.

The viable first release is a compile-time layer for client components and custom hooks:

- classes are authoring syntax, not runtime identity
- dependency inference is static or it fails
- client boundaries are explicit at the module level
- Next.js Server Components remain standard React components
- the React Compiler optimizes Meridian output, but Meridian does not depend on memoization tricks for correctness

That is a strong enough foundation to build on without overpromising.

---

## 15. Sources

Validated on April 3, 2026:

- [React: Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure)
- [React: 'use client'](https://react.dev/reference/rsc/use-client)
- [React: Server Components](https://react.dev/reference/rsc/server-components)
- [React: useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [React: useOptimistic](https://react.dev/reference/react/useOptimistic)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Compiler](https://nextjs.org/docs/architecture/nextjs-compiler)
- [TypeScript 5.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html)
- [Babel decorators plugin](https://babeljs.io/docs/babel-plugin-proposal-decorators)
