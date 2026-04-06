---
title: Introduction
---

# Introduction

Meridian is a compile-time authoring layer for React. You write TypeScript classes with decorators. The Meridian compiler transforms those classes into standard React function components and custom hooks before your bundler runs. The class is authoring syntax — it never exists at runtime.

## The problem with hooks

React hooks are a powerful primitive. But writing hooks directly exposes a lot of mechanism that most component authors would rather not manage:

- **Dependency arrays.** Every `useEffect`, `useMemo`, and `useCallback` requires a manually maintained dependency array. Miss a dependency and you have a stale closure bug. Add an unstable reference and you have an infinite loop.
- **Callback stability.** Event handlers passed to child components must be wrapped in `useCallback` or memoized children re-render on every parent render. This is especially painful for large forms and lists.
- **Ordering rules.** Hooks must be called in the same order on every render. This makes conditional logic awkward and refactoring risky.
- **Mechanical boilerplate.** Even a simple stateful component requires coordinating `useState`, `useEffect`, and `useCallback` in a specific choreography that has nothing to do with what the component is trying to do.

These are not bugs in React. They are the cost of a low-level API. Meridian raises the abstraction level by one layer without hiding the underlying model.

## The core idea

Meridian classes are authoring syntax. They describe the same thing hooks describe — state, refs, effects, derived values — but in a form that is easier to read, easier to refactor, and impossible to get wrong in the ways hooks can be gotten wrong.

The compiler is the real feature. It statically analyzes each class, infers dependency arrays, rewrites `this.field` accesses into the appropriate hook calls, and emits ordinary React TypeScript. The generated output is what your bundler sees. There is no Meridian runtime, no Proxy, and no hidden state.

## A side-by-side example

Here is a counter component that tracks clicks and logs to analytics when the count changes.

**Standard React hooks:**

```tsx
import { useState, useEffect, useCallback } from 'react';

interface CounterProps {
  initialCount?: number;
}

export function Counter({ initialCount = 0 }: CounterProps) {
  const [count, setCount] = useState(initialCount);

  const double = count * 2;

  const increment = useCallback(() => {
    setCount(c => c + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount(c => c - 1);
  }, []);

  useEffect(() => {
    analytics.track('count_changed', { count });
  }, [count]);

  return (
    <div>
      <p>Count: {count} (doubled: {double})</p>
      <button onClick={decrement}>-</button>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

**The same component in Meridian:**

```tsx
'use client';

import { Component, state, effect } from '@meridian/meridian';

interface CounterProps {
  initialCount?: number;
}

export class Counter extends Component<CounterProps> {
  @state count = this.props.initialCount ?? 0;

  get double(): number {
    return this.count * 2;
  }

  increment(): void {
    this.count = this.count + 1;
  }

  decrement(): void {
    this.count = this.count - 1;
  }

  @effect
  trackCount(): void {
    analytics.track('count_changed', { count: this.count });
  }

  render() {
    return (
      <div>
        <p>Count: {this.count} (doubled: {this.double})</p>
        <button onClick={this.decrement}>-</button>
        <button onClick={this.increment}>+</button>
      </div>
    );
  }
}
```

The Meridian version has no dependency array, no `useCallback`, and no manual coordination between hooks. The compiler infers that `trackCount` depends on `this.count` and emits `[count]` as the dependency array. Methods are lowered to local functions — no `useCallback` needed because the React Compiler can handle that optimization.

## The compilation pipeline

```mermaid
flowchart LR
    A["Meridian source\n(.meridian.tsx)"]
    B["Meridian compiler\n(@meridian/compiler)"]
    C["Generated React TSX\n(.meridian/generated/)"]
    D["Next.js / Vite\nbundler"]

    A --> B --> C --> D
```

1. You write Meridian source files (`*.meridian.tsx` or any `.ts`/`.tsx` file with Meridian base classes).
2. `meridian build` or `meridian watch` runs the compiler, which transforms each class into a React function component or custom hook.
3. The generated `.tsx` files land in `.meridian/generated/` and are imported by your application as normal React code.
4. Next.js or Vite processes the generated files exactly as it would any other React component.

The generated code is plain, readable React TypeScript. You can inspect it at any time to understand exactly what Meridian produced.

## Key design principles

**Compile-time correctness over runtime cleverness.** Meridian verifies dependency relationships at build time. If the compiler cannot determine a dependency statically, it emits a build error rather than silently guessing. Stale closure bugs are a build-time failure category, not a runtime surprise.

**Classes are syntax, not framework state.** React owns rendering, state, refs, and effects. Meridian does not introduce a parallel state system. The generated function component is the real component. The class is a way to write it.

**Lean generated output.** Meridian emits idiomatic React. No `useMemo`, no `useCallback`, no wrappers. The React Compiler can optimize the generated output because it looks like ordinary React code written by a careful developer.

**A truthful v1 is better than a broad fantasy.** Unsupported patterns produce explicit build errors. There is no "sort of supported" behavior in Meridian — if a pattern is out of scope, the compiler tells you so and points you to an alternative.

**Incremental adoption.** Meridian components coexist with standard React function components and Next.js Server Components. You do not need to rewrite an entire application to start using Meridian.

## When to use Meridian

Meridian is a good fit when:

- You prefer the organizational clarity of class syntax for complex client components.
- Dependency array management is a recurring source of bugs in your codebase.
- You want type-safe state management without a heavy state library.
- You are building a new Next.js App Router application and want clean client component boundaries.

Meridian is not the right tool when:

- You need Server Components with server-side data fetching — keep those as standard Next.js async function components.
- You need `useTransition`, `useDeferredValue`, or `useOptimistic` — these scheduling APIs are deferred to a future Meridian release.
- You are building a small component with one or two state fields — plain hooks are fine and Meridian would add friction.

## Package overview

| Package | Role |
|---|---|
| `@meridian/meridian` | Base classes (`Component`, `Primitive`) and decorators (`@state`, `@ref`, `@effect`, `@use`). This is the only package your application code imports directly. |
| `@meridian/compiler` | The compiler library. Exports `compileModule(source, filePath)` for programmatic use and integration with build tools. |
| `@meridian/cli` | The `meridian build` and `meridian watch` commands used in `package.json` scripts. |

## Next steps

- Follow the [Installation guide](./installation.md) to add Meridian to an existing project.
- Work through the [Quick Start](./quick-start.md) to build your first component.
- Read [Why Meridian](./why-meridian.md) for a deeper look at the design decisions.
