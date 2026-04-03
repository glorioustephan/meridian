# Meridian

### A Convention-Driven Meta-Framework for React

**Architecture RFC — v0.1**

---

## 1. Thesis

React's hooks API is a leaky abstraction. It asks developers to manually manage dependency arrays, cleanup functions, memoization boundaries, and ordering constraints — all inside the most constrained execution context possible (the render function). The result is code that is correct by vigilance rather than correct by construction.

Meridian replaces this with a **class-based, decorator-driven, convention-enforced** authoring model built entirely on ES6 and TypeScript primitives: classes, inheritance, Proxies, Symbols, private fields, getters, and TC39 Stage 3 decorators. Developers write idiomatic object-oriented TypeScript. Meridian's compiler transforms it into valid functional React components with hooks — fully compatible with the React Compiler, React Server Components, and Next.js.

The developer never writes a hook. The developer never manages a dependency array. The developer never calls `useCallback` or `useMemo`. They fall into a **pit of success** through convention.

---

## 2. Design Principles

1. **Convention over incantation.** If something should happen at mount, the developer implements `onMount()`. There is one right place for each concern, not six possible hooks to choose from.

2. **Classes as the unit of encapsulation.** A component is a class. State is a property. Derived state is a getter. Side effects are lifecycle methods. This maps 1:1 to how developers already think about objects.

3. **ES6 primitives, not framework magic.** Proxies, Symbols, private fields, decorators — these are the building blocks. Meridian uses them; it doesn't hide them. Developers who read the source will find JavaScript, not a DSL.

4. **Hooks are an implementation detail.** Developers don't write hooks. They don't import hooks. If they need custom reusable stateful logic, they write `Primitive` classes that the compiler transforms into hooks. The abstraction is sealed.

5. **React Compiler is a first-class citizen.** Meridian's Babel plugin emits clean functional components *before* the React Compiler runs. The React Compiler then auto-memoizes the output. They compose, not compete.

6. **Server-first by default.** Components without state or effects compile to server-compatible output. The `'use client'` boundary is inferred or explicit. This is how Next.js wants the world to work — Meridian enforces it structurally.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Developer Authoring                    │
│   Class Components · Decorators · Lifecycle Methods      │
│   Primitives · Symbols · Private Fields · Getters        │
└────────────────────────┬────────────────────────────────┘
                         │
                    Build Time
                         │
              ┌──────────▼──────────┐
              │  Meridian Compiler   │
              │  (Babel/SWC Plugin)  │
              │                      │
              │  Classes → Functions │
              │  Decorators → Hooks  │
              │  Lifecycles → Effects│
              │  Primitives → Custom │
              │       Hooks          │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   React Compiler    │
              │  (Auto-Memoization) │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │     React Runtime   │
              │  (Hooks, Fiber,     │
              │   Concurrent Mode)  │
              └─────────────────────┘
```

The compilation pipeline is:

1. **Meridian Compiler** (Babel plugin, with SWC adapter for Next.js) — Transforms class components into functional components with explicit, deterministic hook calls. Runs first.
2. **React Compiler** — Analyzes the functional output and inserts granular memoization. Runs second.
3. **Bundler** (Vite, webpack, Turbopack) — Standard bundling, tree-shaking, code splitting.

Because Meridian's output is a standard functional component with hooks called at the top level in deterministic order, the React Compiler can analyze and optimize it without friction.

---

## 4. The Component Model

### 4.1 Base Classes

Meridian provides a small hierarchy of base classes. This is the entirety of the public class API:

| Base Class | Purpose | Hooks Allowed | `'use client'` |
|---|---|---|---|
| `Component` | Interactive client component | All | Auto-injected |
| `ServerComponent` | Server-only, async data | None | Never |
| `Primitive<T>` | Reusable stateful logic (compiles to custom hook) | All | Inherited |
| `Resource<T>` | Async data lifecycle (fetch/cache/invalidate) | Subset | Inherited |

```typescript
// This is the bread-and-butter class developers interact with.
import { Component } from 'meridian';

export default class Counter extends Component {
  // Reactive state — backed by useState
  @state count = 0;

  // Derived state — backed by useMemo (auto-tracked deps)
  get double(): number {
    return this.count * 2;
  }

  // Action — auto-bound, stable reference
  increment(): void {
    this.count++;
  }

  // Lifecycle — backed by useEffect(fn, [])
  onMount(): void {
    analytics.track('counter_mounted');
  }

  // Lifecycle — backed by useEffect cleanup
  onDismount(): void {
    analytics.track('counter_dismounted');
  }

  // Required — the render method
  render(): JSX.Element {
    return (
      <button onClick={this.increment}>
        {this.count} (×2: {this.double})
      </button>
    );
  }
}
```

### 4.2 What the Compiler Emits

The class above compiles into approximately:

```typescript
'use client';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

function Counter(props: {}) {
  const [count, setCount] = useState(0);

  const double = useMemo(() => count * 2, [count]);

  const increment = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    analytics.track('counter_mounted');
    return () => {
      analytics.track('counter_dismounted');
    };
  }, []);

  return (
    <button onClick={increment}>
      {count} (×2: {double})
    </button>
  );
}

export default Counter;
```

Key observations:

- Hooks are called at the top level in a fixed order derived from the class definition (fields, then getters, then lifecycles). The order is deterministic and static — it cannot vary between renders.
- `'use client'` is injected because the class uses `@state` and lifecycle hooks. A class with no client-side features would omit it.
- The React Compiler then further optimizes this output with granular memoization.

### 4.3 Server Components

```typescript
import { ServerComponent } from 'meridian';
import { db } from '@/lib/db';

export default class ProductPage extends ServerComponent<{ id: string }> {
  // Async data loading — runs on the server only
  async resolve(): Promise<void> {
    this.product = await db.product.findUnique({
      where: { id: this.props.id }
    });
  }

  private product: Product | null = null;

  render(): JSX.Element {
    if (!this.product) return <NotFound />;
    return (
      <article>
        <h1>{this.product.name}</h1>
        <p>{this.product.description}</p>
        <AddToCartButton productId={this.product.id} />
      </article>
    );
  }
}
```

`ServerComponent` enforces at the **type level** that `@state`, `@effect`, and client lifecycle hooks cannot be used. The compiler also validates this and throws a build error if violated. The output is an async function component with no `'use client'` directive — fully compatible with Next.js App Router.

---

## 5. Decorators

Meridian uses **TC39 Stage 3 decorators** (TypeScript 5.0+, no `experimentalDecorators` flag). This is the standard that has reached broad toolchain support in TypeScript, Babel, and is approaching native browser implementation.

### 5.1 Property Decorators

| Decorator | React Hook | Purpose |
|---|---|---|
| `@state` | `useState` | Reactive mutable state |
| `@ref` | `useRef` | Mutable ref (DOM or value) |
| `@context(Ctx)` | `useContext` | Read from a React context |
| `@id` | `useId` | Stable unique ID |

```typescript
class SearchForm extends Component {
  @state query = '';
  @ref inputEl: HTMLInputElement | null = null;
  @context(ThemeContext) theme!: Theme;
  @id formId!: string;
}
```

### 5.2 Method Decorators

| Decorator | React Hook | Purpose |
|---|---|---|
| `@effect` | `useEffect` | Side effect (auto-tracked deps) |
| `@effect.layout` | `useLayoutEffect` | Synchronous DOM measurement |
| `@effect.insertion` | `useInsertionEffect` | CSS-in-JS injection |
| `@transition` | `useTransition` | Wraps method in startTransition |

```typescript
class Dashboard extends Component {
  @state data: DashboardData | null = null;
  @state filter = 'all';

  // Auto-tracks: re-runs when `this.filter` changes
  @effect
  async fetchData(): Promise<void> {
    const result = await api.getDashboard(this.filter);
    this.data = result;
  }

  // Synchronous DOM measurement after render
  @effect.layout
  measureLayout(): void {
    const rect = this.containerRef?.getBoundingClientRect();
    if (rect) this.dimensions = rect;
  }

  // Non-urgent update wrapped in transition
  @transition
  applyFilter(filter: string): void {
    this.filter = filter;
  }
}
```

### 5.3 Class Decorators

| Decorator | Purpose |
|---|---|
| `@provider(Ctx, value)` | Wraps component output in a Context.Provider |
| `@errorBoundary` | Generates an error boundary wrapper |
| `@suspense(fallback)` | Wraps output in a Suspense boundary |
| `@memo` | Wraps component in React.memo with custom comparator |
| `@displayName(name)` | Sets the component display name for DevTools |

```typescript
@provider(ThemeContext, () => useThemeValue())
@errorBoundary
export default class App extends Component {
  render(): JSX.Element {
    return <Shell />;
  }
}
```

### 5.4 Dependency Tracking

A central innovation: **decorators and getter access patterns are statically analyzed at compile time** to determine hook dependencies. The compiler traces which `@state` fields a getter reads, which `@state` fields an `@effect` method accesses, and emits the correct dependency arrays automatically.

For cases that escape static analysis (dynamic property access, external closures), the compiler falls back to the runtime's Proxy-based tracking layer, which records property access during execution and produces dependency arrays at runtime. This hybrid approach ensures correctness without manual dependency management.

```typescript
// Static analysis: compiler sees `this.count` access → deps = [count]
get double(): number {
  return this.count * 2;
}

// Dynamic: Proxy tracks access at runtime → deps determined per-render
@effect
logChanges(): void {
  const key = this.activeMetric; // dynamic key
  console.log(this[key]);        // Proxy intercepts, tracks `this[key]`
}
```

---

## 6. Lifecycle Hooks (Convention-Based)

Inspired by Glimmer's radical simplification (constructor + willDestroy, with modifiers for DOM), Meridian defines a small, fixed set of lifecycle methods. If the method exists on the class, it participates. There is no registration, no decorator needed — pure convention.

| Method | When | React Equivalent | Cleanup |
|---|---|---|---|
| `constructor()` | Class instantiation (once) | — | — |
| `onMount()` | After first render, DOM available | `useEffect(fn, [])` | Return cleanup fn |
| `onDismount()` | Before unmount | `useEffect` cleanup from mount | — |
| `onUpdate()` | After every re-render | `useEffect(fn)` (no deps) | Return cleanup fn |
| `onLayout()` | After render, before paint | `useLayoutEffect(fn)` | Return cleanup fn |
| `onError(error, info)` | Descendant throws during render | Error boundary `componentDidCatch` | — |
| `onSuspense()` | Async children are pending | Suspense boundary | — |

### Key design decisions:

**Mount and dismount are separate methods, not a function-that-returns-a-function.** React's `useEffect(() => { setup; return () => teardown }, [])` pattern conflates setup and teardown into one expression. This is a cognitive tax. Meridian separates them into `onMount` and `onDismount`. The compiler pairs them into a single `useEffect` call.

**`onMount` optionally returns a cleanup function for mount-specific cleanup.** If you need cleanup that is specifically tied to mount (e.g., a subscription), return it from `onMount`. `onDismount` is for final teardown.

**`onUpdate` is the escape hatch.** It fires after every render. It should be rare. The linter warns if you use it without a comment explaining why. The preferred approach is `@effect` methods with tracked dependencies.

**`onError` and `onSuspense` compile to wrapper components.** Because React error boundaries and Suspense require component-level boundaries, the compiler wraps the component's render output in the appropriate boundary components when these methods are present.

```typescript
class WebSocketChat extends Component {
  @state messages: Message[] = [];
  private ws: WebSocket | null = null;

  onMount(): void {
    this.ws = new WebSocket(this.props.url);
    this.ws.onmessage = (e) => {
      this.messages = [...this.messages, JSON.parse(e.data)];
    };
  }

  onDismount(): void {
    this.ws?.close();
  }

  render(): JSX.Element {
    return (
      <ul>
        {this.messages.map(m => <li key={m.id}>{m.text}</li>)}
      </ul>
    );
  }
}
```

---

## 7. Primitives — Custom Hooks as Classes

When developers need **reusable, composable stateful logic** (what React calls "custom hooks"), they write `Primitive` classes. A Primitive is the Meridian equivalent of a custom hook — it is a class that compiles to a function.

```typescript
import { Primitive, state, effect } from 'meridian';

class UseDebounce<T> extends Primitive<T> {
  @state debouncedValue: T;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private value: T, private delay: number) {
    super();
    this.debouncedValue = value;
  }

  @effect
  sync(): void {
    this.timeoutId = setTimeout(() => {
      this.debouncedValue = this.value;
    }, this.delay);
  }

  onDismount(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
  }

  // The `resolve` method defines what the primitive "returns"
  resolve(): T {
    return this.debouncedValue;
  }
}
```

Consumed within a component:

```typescript
class SearchPage extends Component {
  @state query = '';

  // `@use` wires in a Primitive — compiled to a custom hook call
  @use(UseDebounce, () => [this.query, 300])
  debouncedQuery!: string;

  @effect
  async search(): void {
    if (this.debouncedQuery) {
      this.results = await api.search(this.debouncedQuery);
    }
  }
}
```

The compiler transforms `@use` into a custom hook invocation at the top of the functional component, in deterministic order with all other hooks. The `Primitive` class itself compiles to a custom hook function.

---

## 8. Resources — Async Data as a First-Class Concept

`Resource` extends `Primitive` specifically for async data fetching patterns. It provides a structured lifecycle for fetch → cache → invalidate → refetch, and integrates with React Suspense.

```typescript
import { Resource, state } from 'meridian';

class UserResource extends Resource<User> {
  async fetch(): Promise<User> {
    const res = await fetch(`/api/users/${this.props.id}`);
    return res.json();
  }

  // Optional: cache key for deduplication
  get cacheKey(): string {
    return `user:${this.props.id}`;
  }

  // Optional: stale-while-revalidate window
  staleTime = 30_000; // 30 seconds
}

// Usage
class ProfileCard extends Component {
  @use(UserResource, () => ({ id: this.props.userId }))
  user!: ResourceState<User>;
  // ResourceState<T> = { data: T | null, loading: boolean, error: Error | null }

  render(): JSX.Element {
    if (this.user.loading) return <Skeleton />;
    if (this.user.error) return <ErrorDisplay error={this.user.error} />;
    return <Card name={this.user.data!.name} />;
  }
}
```

---

## 9. ES6 Primitives in Action

Meridian intentionally surfaces the power of ES6/TypeScript. Here's how each primitive maps:

### 9.1 Private Fields (`#`)

```typescript
class SecureForm extends Component {
  // Truly private — not accessible from outside, not reactive
  #validationCache = new Map<string, boolean>();

  @state email = '';

  get isValid(): boolean {
    if (this.#validationCache.has(this.email)) {
      return this.#validationCache.get(this.email)!;
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email);
    this.#validationCache.set(this.email, valid);
    return valid;
  }
}
```

Private fields (`#`) are **not reactive** — they are internal bookkeeping. Only `@state` fields trigger re-renders. This gives developers explicit control over what is and isn't reactive.

### 9.2 Symbols as Protocol Keys

Meridian uses well-known Symbols for framework protocols, allowing components to participate in framework behavior without naming collisions:

```typescript
import { Component, Symbols } from 'meridian';

class AnimatedList extends Component {
  // Symbol-based protocol: tells Meridian how to diff children
  [Symbols.childKey](child: JSX.Element): string {
    return child.props.id;
  }

  // Symbol-based protocol: tells Meridian this component manages its own transitions
  [Symbols.transition] = true;

  // Symbol-based protocol: DevTools metadata
  [Symbols.debugLabel] = 'AnimatedList<Product>';
}
```

The public Symbols are:

| Symbol | Purpose |
|---|---|
| `Symbols.childKey` | Custom keying strategy for list children |
| `Symbols.transition` | Opt into View Transitions API integration |
| `Symbols.debugLabel` | Custom label for React DevTools |
| `Symbols.serialize` | Custom RSC serialization |
| `Symbols.dispose` | Explicit resource disposal protocol |

### 9.3 Proxies (Internal)

Proxies are used **internally by the runtime**, not authored by developers directly. The Meridian runtime wraps the conceptual class instance in a Proxy for two purposes:

1. **Access tracking** — During `@effect` execution and getter evaluation, the Proxy records which `@state` properties were accessed, producing dependency arrays automatically.
2. **State mutation interception** — When a developer writes `this.count++`, the Proxy intercepts the set operation and routes it through the corresponding `setState` function.

This is the same fundamental approach that made MobX effective, but scoped to the component lifecycle and coordinated with React's batching model.

### 9.4 Inheritance

Class inheritance works as expected. This is one of the most requested patterns that hooks cannot express naturally:

```typescript
// Base component with shared analytics behavior
abstract class TrackedComponent extends Component {
  abstract readonly trackingId: string;

  onMount(): void {
    analytics.track(`${this.trackingId}:mounted`);
  }

  onDismount(): void {
    analytics.track(`${this.trackingId}:dismounted`);
  }
}

// Concrete component inherits lifecycle behavior
class ProductCard extends TrackedComponent {
  readonly trackingId = 'product_card';

  @state expanded = false;

  render(): JSX.Element {
    return (
      <div>
        <h2>{this.props.product.name}</h2>
        {this.expanded && <Details product={this.props.product} />}
        <button onClick={() => this.expanded = !this.expanded}>
          {this.expanded ? 'Less' : 'More'}
        </button>
      </div>
    );
  }
}
```

The compiler resolves the full class hierarchy and flattens all hooks from parent and child into a single functional component, in a deterministic order: parent fields → child fields → parent getters → child getters → parent lifecycles → child lifecycles.

### 9.5 Readonly / Immutable Props

TypeScript's type system enforces immutability of props:

```typescript
class Greeting extends Component<{ readonly name: string }> {
  render(): JSX.Element {
    // this.props.name = 'foo'; // TypeScript error: readonly
    return <h1>Hello, {this.props.name}</h1>;
  }
}
```

The `Component<Props>` generic makes `this.props` deeply readonly by default, enforcing unidirectional data flow at the type level.

---

## 10. React Hook Opt-In (Metadata Layer)

For advanced developers who need to know or control which React hooks are in play, Meridian provides a **metadata inspection API** — not direct hook access, but a declarative way to influence hook behavior:

```typescript
import { Component, state, hookMeta } from 'meridian';

class AdvancedForm extends Component {
  @state value = '';

  // Explicitly request useLayoutEffect instead of useEffect for this method
  @effect.layout
  syncScroll(): void {
    this.scrollContainer?.scrollTo(0, this.scrollPosition);
  }

  // Explicitly request useDeferredValue for this state
  @state.deferred searchQuery = '';

  // Explicitly request useOptimistic for this state
  @state.optimistic likes = 0;
  async addLike(): Promise<void> {
    this.likes++; // optimistic update
    await api.addLike(this.props.postId); // server call
  }
}
```

The `@state.deferred` and `@state.optimistic` modifiers are **composable decorator factories** that map to `useDeferredValue` and `useOptimistic` respectively. The developer opts into the React hook's behavior through the decorator modifier, never touching the hook directly.

Available state modifiers:

| Modifier | React Hook | When to use |
|---|---|---|
| `@state` | `useState` | Default reactive state |
| `@state.deferred` | `useDeferredValue` | Non-urgent derived values |
| `@state.optimistic` | `useOptimistic` | Optimistic UI updates |
| `@state.external(store)` | `useSyncExternalStore` | External store subscription |
| `@state.reducer(fn)` | `useReducer` | Complex state logic |

---

## 11. Compatibility Matrix

### 11.1 React Compiler

The React Compiler operates on AST analysis of functional components. Meridian's compiler produces functional components before the React Compiler runs. Compatibility requirements:

- **Deterministic hook order** — Meridian derives hook order from the class definition (a static structure), so hooks are always called in the same order.
- **No conditional hooks** — Class properties, getters, and lifecycle methods are all unconditional. The compiler emits all hooks at the top level.
- **Pure render path** — The `render()` method compiles to the function body's return statement. Side effects live in lifecycle methods/effects, not in render.
- **Stable references** — Methods are wrapped in `useCallback` (or left for the React Compiler to optimize). `@state` setters are inherently stable.

### 11.2 React Server Components

| Feature | Server Component | Client Component |
|---|---|---|
| `@state` | Build error | Allowed |
| `@effect` | Build error | Allowed |
| `onMount/onDismount` | Build error | Allowed |
| `get` (computed) | Allowed (plain getter) | Allowed (useMemo) |
| `async resolve()` | Allowed | Build error |
| `@context` | Build error | Allowed |
| `@ref` | Build error | Allowed |
| Props | Serializable only | Any |

The `ServerComponent` base class enforces these constraints at the TypeScript level (decorators and methods are simply not available on the type) and at the compiler level (build errors if violated).

### 11.3 Next.js

Meridian integrates with Next.js through:

1. **SWC Plugin** — A companion SWC plugin (wrapping the Babel transform) for Next.js's build pipeline, ensuring the Meridian transform runs before the React Compiler.
2. **`'use client'` inference** — Components extending `Component` (with state/effects) automatically get the `'use client'` directive. Components extending `ServerComponent` never get it.
3. **App Router conventions** — `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` files work as expected. Meridian components export as default from these files.
4. **Server Actions** — `'use server'` functions are orthogonal to Meridian's class model. They can be called from within component methods normally.

```typescript
// app/products/[id]/page.tsx
import { ServerComponent } from 'meridian';

export default class ProductPage extends ServerComponent<{ params: { id: string } }> {
  private product: Product | null = null;

  async resolve(): Promise<void> {
    this.product = await getProduct(this.props.params.id);
  }

  render(): JSX.Element {
    return (
      <main>
        <ProductDetails product={this.product!} />
        <AddToCartButton productId={this.props.params.id} />
      </main>
    );
  }
}
```

---

## 12. Runtime Layer

The Meridian runtime is a lightweight (~4KB gzipped) module that provides:

1. **`createMeridianComponent(ClassDef)`** — The factory function that the compiler's output calls. It creates the functional component wrapper, initializes the Proxy-based instance, and wires up hook bindings.

2. **`ProxyTracker`** — A `Proxy` handler that intercepts `get` and `set` on the instance, routing state reads to tracking sets and state writes to `setState` calls. Uses `WeakMap` internally to avoid memory leaks.

3. **`EffectScheduler`** — Coordinates `@effect` dependency tracking with React's batching. During an effect's execution, the `ProxyTracker` records all accessed `@state` fields. On re-render, if none of those fields changed, the effect is skipped. This produces behavior identical to a correctly-written dependency array, but without the developer writing one.

4. **`PrimitiveRegistry`** — A `WeakMap<Component, Map<Symbol, Primitive>>` that manages the lifecycle of `@use`-connected Primitives within a component's lifetime.

5. **`Symbol` definitions** — All framework Symbols (`Symbols.childKey`, `Symbols.transition`, etc.) exported for protocol participation.

The runtime does **not** patch React internals. It operates entirely through React's public API (hooks, createElement, createContext, etc.).

---

## 13. Linting and DX

Meridian ships with an ESLint plugin (`eslint-plugin-meridian`) that enforces conventions:

| Rule | What it catches |
|---|---|
| `no-direct-hooks` | Import of `useState`, `useEffect`, etc. inside a Meridian component file |
| `lifecycle-order` | Lifecycle methods not in conventional order (constructor → onMount → onUpdate → onLayout → onDismount → render) |
| `no-state-in-render` | State mutation inside `render()` |
| `prefer-computed` | State that could be a getter |
| `require-render` | Component class missing `render()` method |
| `server-no-client-features` | `@state` / `@effect` in a `ServerComponent` |
| `explain-onUpdate` | `onUpdate()` without a JSDoc comment explaining why |
| `prefer-effect-over-lifecycle` | `onUpdate` where a tracked `@effect` would be more precise |

The plugin also provides **auto-fixes** for common migrations from hooks-based code to Meridian patterns.

### DevTools Integration

Meridian components show up in React DevTools with their class names and a `[Meridian]` badge. State properties decorated with `@state` appear as named state entries rather than anonymous `useState` indices. The `Symbols.debugLabel` allows custom labels for complex component trees.

---

## 14. Migration Path

Meridian is **incrementally adoptable**. It does not require rewriting an application.

- **Coexistence**: Meridian components and standard React functional components can be used in the same tree. A Meridian component can render a hooks-based component and vice versa.
- **Bottom-up**: Start by converting leaf components. Work inward.
- **Codemod**: A codemod (`meridian-migrate`) handles mechanical transformations: `useState` → `@state`, `useEffect` → lifecycle methods, `useMemo` → getters, `useCallback` → method references.
- **Escape hatch**: The `@raw` decorator on a method gives it direct access to React hooks for edge cases during migration. This should be temporary and the linter warns on its use.

```typescript
class LegacyBridge extends Component {
  // Escape hatch: raw hook access during migration
  @raw
  useThirdPartyHook(): ThirdPartyState {
    return useThirdPartyLibrary(this.props.config);
  }
}
```

---

## 15. Project Structure Convention

Meridian encourages (and the linter enforces) a file structure:

```
src/
  components/
    Counter/
      Counter.ts          ← Component class
      Counter.test.ts     ← Tests
      Counter.styles.ts   ← Styles (CSS modules, Tailwind, etc.)
  primitives/
    UseDebounce.ts        ← Primitive classes (custom hooks)
    UseMediaQuery.ts
  resources/
    UserResource.ts       ← Resource classes (data fetching)
    ProductResource.ts
  contexts/
    ThemeContext.ts        ← Context definitions
  lib/
    *.ts                  ← Pure utilities (no framework imports)
```

This structure makes it immediately clear where each type of concern lives. Components are in `components/`. Reusable stateful logic is in `primitives/`. Data fetching is in `resources/`. There is one right place for each thing.

---

## 16. Complete Example — A Real-World Feature

```typescript
// resources/ChatResource.ts
import { Resource } from 'meridian';

export class ChatResource extends Resource<Message[]> {
  private ws: WebSocket | null = null;

  async fetch(): Promise<Message[]> {
    return api.getMessages(this.props.roomId);
  }

  onMount(): void {
    this.ws = new WebSocket(`wss://chat.example.com/${this.props.roomId}`);
    this.ws.onmessage = (e) => {
      const message = JSON.parse(e.data);
      this.update(prev => [...prev, message]);
    };
  }

  onDismount(): void {
    this.ws?.close();
  }

  get cacheKey(): string {
    return `chat:${this.props.roomId}`;
  }
}


// components/ChatRoom/ChatRoom.ts
import { Component, state, ref, context } from 'meridian';
import { ChatResource } from '@/resources/ChatResource';
import { AuthContext } from '@/contexts/AuthContext';

export default class ChatRoom extends Component<{ roomId: string }> {
  @state draft = '';
  @ref messageList: HTMLDivElement | null = null;
  @context(AuthContext) auth!: AuthState;

  @use(ChatResource, () => ({ roomId: this.props.roomId }))
  chat!: ResourceState<Message[]>;

  @effect.layout
  scrollToBottom(): void {
    this.messageList?.scrollTo(0, this.messageList.scrollHeight);
  }

  async send(): Promise<void> {
    if (!this.draft.trim()) return;
    await api.sendMessage(this.props.roomId, {
      text: this.draft,
      userId: this.auth.user.id,
    });
    this.draft = '';
  }

  render(): JSX.Element {
    return (
      <div className="chat-room">
        <div ref={el => this.messageList = el} className="messages">
          {this.chat.data?.map(msg => (
            <MessageBubble key={msg.id} message={msg} isMine={msg.userId === this.auth.user.id} />
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); this.send(); }}>
          <input
            value={this.draft}
            onChange={e => this.draft = e.target.value}
            placeholder="Type a message..."
          />
          <button type="submit">Send</button>
        </form>
      </div>
    );
  }
}
```

---

## 17. Open Questions and Future Work

1. **Concurrent features** — `useActionState`, `useFormStatus`, and form Actions are evolving rapidly in React 19.x. Meridian will need decorator-based analogs. A `@action.form` decorator is under consideration.

2. **TC39 Signals** — The Signals proposal (currently Stage 1) could eventually replace Meridian's Proxy-based tracking with a standards-based reactivity primitive. The architecture is designed so the tracking layer is swappable.

3. **Decorator metadata** — TC39's decorator metadata proposal provides a standard way to associate metadata with decorated class members, which could simplify the compiler's static analysis pass. Meridian should adopt this as it stabilizes.

4. **View Transitions API** — Integration with the browser's View Transitions API through the `Symbols.transition` protocol is prototyped but needs more design work for complex animation orchestration.

5. **Testing utilities** — A `@testing-library/meridian` package that provides ergonomic testing of Meridian components, including the ability to inspect `@state` values, trigger lifecycle hooks in isolation, and mock `Primitive`/`Resource` instances.

6. **Hot Module Replacement** — Ensuring Meridian's compiled output preserves HMR boundaries correctly. Initial testing with Vite's HMR shows correct behavior; Next.js Fast Refresh needs verification.

---

## 18. Summary

Meridian is a thin, convention-driven layer that restores object-oriented authoring to React without abandoning React's runtime, ecosystem, or trajectory.

**What developers get:**
- Classes, inheritance, private fields, decorators, Symbols — the full ES6/TypeScript toolkit
- Convention-based lifecycle hooks with one right place for each concern
- No dependency arrays, no `useCallback`, no `useMemo` — ever
- Type-safe server/client boundary enforcement
- Incremental adoption alongside existing React code

**What the framework preserves:**
- Full React Compiler optimization
- Full React Server Components compatibility
- Full Next.js App Router integration
- React DevTools visibility
- The entire React ecosystem (libraries, testing tools, etc.)

The hooks are still there. They're just not the developer's problem anymore.