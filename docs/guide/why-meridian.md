---
title: Why Meridian
---

# Why Meridian

Meridian exists because hooks are a powerful primitive that exposes too much mechanism in the render path. This page explains what that means in practice, why alternatives were considered and rejected, and where Meridian fits in a React codebase.

## The problem: hooks accumulate complexity

A simple counter with `useState` is fine. The complexity becomes apparent when a component grows to have multiple concerns — fetching data, responding to resizing, debouncing user input, and subscribing to an event source. Consider a realistic component: a search panel that debounces the user's query, fetches results, and tracks the container's width to decide whether to show a condensed layout.

**In standard React:**

```tsx
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';

interface SearchPanelProps {
  endpoint: string;
  debounceMs?: number;
}

export function SearchPanel({ endpoint, debounceMs = 300 }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced query — separate state required to track the delayed value
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(id);
  }, [query, debounceMs]);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${endpoint}?q=${encodeURIComponent(debouncedQuery)}`, {
      signal: abortRef.current.signal,
    })
      .then(r => r.json())
      .then(data => {
        setResults(data.results);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err);
          setLoading(false);
        }
      });

    return () => abortRef.current?.abort();
  }, [debouncedQuery, endpoint]);

  // Resize observer for container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // BUG WAITING TO HAPPEN: if containerRef.current changes, this doesn't re-run

  const isCondensed = useMemo(() => containerWidth < 400, [containerWidth]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  return (
    <div ref={containerRef} className={isCondensed ? 'condensed' : 'full'}>
      <input value={query} onChange={handleChange} placeholder="Search..." />
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      <ul>
        {results.map(r => <li key={r.id}>{r.title}</li>)}
      </ul>
    </div>
  );
}
```

This component has several problems:

1. The debounce logic requires two `useState` fields (`query` and `debouncedQuery`) and a `useEffect` that manually manages the timer. That's 15 lines for one conceptual operation.
2. The fetch effect has a stale closure risk: `endpoint` appears in the dependency array but `abortRef` does not (ref reads in effects are a known footgun).
3. The resize observer's dependency array is empty `[]`, which is wrong if `containerRef.current` ever changes. This is the classic "empty deps array + ref" bug.
4. `useCallback` on `handleChange` is purely defensive — it has no intrinsic value to the component's logic.
5. `useMemo` on `isCondensed` is a single boolean comparison that does not need memoization.

The hooks themselves are not wrong. The problem is that the author must manually coordinate all of them and maintain invariants that the language cannot enforce.

**The same component in Meridian:**

```tsx
'use client';

import { Component, Primitive, state, ref, effect, use } from 'meridian';
import { UseDebounce } from './UseDebounce';

interface SearchPanelProps {
  endpoint: string;
  debounceMs?: number;
}

export class SearchPanel extends Component<SearchPanelProps> {
  @state query = '';
  @state results: SearchResult[] = [];
  @state loading = false;
  @state error: Error | null = null;
  @state containerWidth = 0;

  @ref containerEl!: React.RefObject<HTMLDivElement>;
  @ref abortController!: React.RefObject<AbortController | null>;

  @use(UseDebounce, () => [this.query, this.props.debounceMs ?? 300])
  debouncedQuery!: string;

  get isCondensed(): boolean {
    return this.containerWidth < 400;
  }

  handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    this.query = e.target.value;
  }

  @effect
  observeContainer(): () => void {
    const el = this.containerEl.current;
    if (!el) return () => {};
    const observer = new ResizeObserver(entries => {
      this.containerWidth = entries[0]?.contentRect.width ?? 0;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }

  @effect
  async fetchResults(): Promise<void> {
    if (!this.debouncedQuery) {
      this.results = [];
      return;
    }
    this.abortController.current?.abort();
    this.abortController.current = new AbortController();
    this.loading = true;
    this.error = null;

    try {
      const r = await fetch(
        `${this.props.endpoint}?q=${encodeURIComponent(this.debouncedQuery)}`,
        { signal: this.abortController.current.signal }
      );
      const data = await r.json();
      this.results = data.results;
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        this.error = err as Error;
      }
    } finally {
      this.loading = false;
    }
  }

  render() {
    return (
      <div ref={this.containerEl} className={this.isCondensed ? 'condensed' : 'full'}>
        <input value={this.query} onChange={this.handleChange} placeholder="Search..." />
        {this.loading && <p>Loading...</p>}
        {this.error && <p>Error: {this.error.message}</p>}
        <ul>
          {this.results.map(r => <li key={r.id}>{r.title}</li>)}
        </ul>
      </div>
    );
  }
}
```

The Meridian version is shorter, and more importantly it eliminates entire categories of error:

- Debouncing is encapsulated in `UseDebounce` and composed with `@use`. The timer logic lives in one place.
- There is no dependency array to maintain on `fetchResults`. The compiler sees `this.debouncedQuery` and `this.props.endpoint` and emits the correct array automatically.
- `isCondensed` is a getter — a plain derived expression. No `useMemo`.
- `handleChange` is a plain method. No `useCallback`.

## Design principles

### Compile-time correctness, not runtime cleverness

The original Meridian design (v0.1) used a Proxy-based runtime to track property accesses and synthesize dependency arrays. That approach is attractive but fundamentally wrong for React.

React's render model assumes components and hooks are pure and can be re-run, restarted, or discarded safely — especially during Strict Mode double-invocation and concurrent rendering. A live mutable class instance that persists between renders creates a second state system with identity and mutation semantics that React does not own. That breaks Strict Mode invariants and makes the component incompatible with concurrent features.

Meridian v1 treats the class as authoring syntax only. Dependency inference happens at build time by analyzing the AST. If the compiler cannot determine the dependency set statically — because the code uses computed property access like `this[key]` or iterates over `this` — it emits a build error. That is a deliberate tradeoff: a compile-time error is always better than a runtime bug that manifests only in production.

### Static inference or fail

Some developers ask: why not fall back to `// eslint-disable-next-line` style escape hatches, or to `@effect.unsafe` that accepts a manually specified dependency array?

The answer is that partial correctness is worse than a clear failure. If Meridian infers most dependencies and you manually specify the rest, the system has two mental models and you still have to think about dependency arrays — the exact problem Meridian is trying to eliminate. A build error is information. It tells you that the pattern you wrote is not statically analyzable and that you should restructure it.

In practice, the patterns that defeat static inference (`this[key]`, `Object.keys(this)`) are also patterns that indicate the wrong data structure. The fix is almost always to restructure the component, not to disable the check.

### Lean output

Meridian does not emit `useMemo` or `useCallback`. Getters become plain `const` expressions. Methods become local `function` declarations. This keeps the generated code readable and lets the React Compiler apply optimizations where they are actually warranted, rather than every place the author added a defensive `useCallback` out of habit.

### Why not decorated inheritance?

An earlier design considered flattening reactive members across a class hierarchy: a `Component` extending a base class that also has `@state` and `@effect` members. This sounds ergonomic, but it introduces ordering complexity that is hard to specify correctly.

Hook calls must happen in a stable order. In a single-class model, that order is source order. With inheritance, the order depends on which hooks live on the parent, which live on the child, and how TypeScript's field initializer semantics interact with `super()`. These interactions produce subtle bugs that are difficult to diagnose and harder to document.

Reusable reactive logic belongs in `Primitive<T>`, composed with `@use`. That model is explicit about ordering — all `@use` calls appear at the top of the generated function in source order — and does not depend on class hierarchy resolution.

## How Meridian fits with the React Compiler

The React Compiler (formerly "Forget") automatically memoizes components and hooks when it can prove it is safe to do so. Meridian's generated output is valid input for the React Compiler because it is plain idiomatic React with no manual `useMemo` or `useCallback`.

The relationship is complementary, not competitive. Meridian handles authoring ergonomics. The React Compiler handles optimization. Neither depends on the other for correctness.

## Tradeoffs to understand

Meridian is not a replacement for understanding React. If you are new to React, learn hooks first — Meridian's abstraction makes more sense when you understand what it is hiding. The documentation consistently shows both the Meridian source and the generated React output so you always know what is running.

The compile step adds a layer of indirection. Generated files land in `.meridian/generated/`. You can inspect them at any time, but they are not the code you write. Some developers find this uncomfortable; others find it liberating. Either response is reasonable.

v1 has explicit limitations — no Server Components, no `useTransition`, no `useDeferredValue`. These are deliberate choices, not oversights. Shipping a narrower, correct v1 is better than shipping broad, partially-supported behavior. The [unsupported features list](./introduction.md) is honest about what is deferred.
