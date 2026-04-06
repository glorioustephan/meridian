---
title: Primitives
---

# Primitives

`Primitive<T>` is the Meridian abstraction for reusable stateful logic. A `Primitive` compiles to a custom React hook. It is the Meridian equivalent of extracting logic into a `use*` function, written in class syntax with the same decorator support as `Component<Props>`.

## What is a Primitive

A `Primitive<T>` class:

- Compiles to a custom hook function (e.g., `class UseDebounce<T>` → `function useDebounce<T>(...)`)
- Can use `@state`, `@ref`, `@effect`, `@effect.layout`, getters, and methods — the same features as `Component<Props>`
- Does not have a `render()` method
- Has a `resolve()` method that defines what the hook returns
- Is consumed from components (or other Primitives) via the `@use` decorator

## Authoring a Primitive

Here is a debounce Primitive that delays a value update by a configurable amount:

```tsx
// src/primitives/UseDebounce.ts
import { Primitive, state, effect } from '@meridian/meridian';

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

What each part does:

- The constructor captures `value` and `delay` as the hook's parameters.
- `@state current` holds the debounced value, initialized to the first `value` received.
- `@effect sync()` sets a timer to update `current` after `delay` milliseconds whenever `value` or `delay` changes. The compiler infers the dependency array as `[value, delay]`.
- `resolve()` returns `current` — this becomes the hook's return value.

:::tip
Primitive files do not need `'use client'` at the top. Only `Component` files that are module-level client entrypoints require the directive. A Primitive is a library of logic, not a module boundary.
:::

### Generated hook output

<details>
<summary>View generated output for UseDebounce</summary>

```tsx
// .meridian/generated/primitives/UseDebounce.ts
import { useState, useEffect } from 'react';

export function useUseDebounce<T>(value: T, delay: number): T {
  const [current, setCurrent] = useState<T>(() => value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrent(value);
    }, delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return current;
}
```

</details>

The class becomes a `function` prefixed with `use`. Constructor parameters become hook parameters. `resolve()` becomes the return statement.

## Consuming a Primitive with @use

Use the `@use` decorator in a `Component` to call the Primitive's hook:

```tsx
'use client';

import { Component, state, use } from '@meridian/meridian';
import { UseDebounce } from '@meridian/primitives/UseDebounce';

export class SearchPage extends Component {
  @state query = '';

  @use(UseDebounce, () => [this.query, 300])
  debouncedQuery!: string;

  render() {
    return (
      <div>
        <input
          value={this.query}
          onChange={e => { this.query = e.target.value; }}
        />
        <SearchResults query={this.debouncedQuery} />
      </div>
    );
  }
}
```

The `@use` decorator takes two arguments:

1. The `Primitive` class to use.
2. An args factory: an arrow function `() => [...]` that returns the constructor arguments to pass to the hook.

The args factory is evaluated on every render to provide the current argument values. It must be a statically analyzable inline arrow function — the compiler reads the array elements to determine which state and props the hook call depends on.

Generated output for `@use(UseDebounce, () => [this.query, 300])`:

```tsx
const debouncedQuery = useUseDebounce(query, 300);
```

The field name (`debouncedQuery`) becomes the local variable name. The field type annotation (`!: string`) declares what type `resolve()` returns — the compiler uses this for the generated hook call.

### The args factory constraint

The args factory must be a simple inline arrow function that returns an array literal. Each element of the array must be a statically resolvable expression — a `this.stateField`, `this.props.x`, or a literal value:

```tsx
// Valid
@use(UseDebounce, () => [this.query, 300])
debouncedQuery!: string;

// Valid — props are fine
@use(UseDebounce, () => [this.query, this.props.debounceMs])
debouncedQuery!: string;

// Invalid — computed value cannot be analyzed statically
@use(UseDebounce, () => [this.query, this.getDelay()])
debouncedQuery!: string;
```

:::warning
If the args factory contains a non-analyzable expression, the compiler emits diagnostic M008 and halts code generation. Restructure the args to use direct field reads.
:::

## Hook ordering guarantee

The compiler emits all `@use` calls at the top of the generated function body, before any `@state`, `@ref`, or `@effect` declarations. Within the `@use` group, calls are emitted in source order. This ensures deterministic hook ordering and satisfies React's rules of hooks.

```tsx
export class MyComponent extends Component {
  @state localValue = '';

  @use(PrimitiveA, () => [this.localValue])
  resultA!: string;

  @use(PrimitiveB, () => [this.resultA])
  resultB!: number;

  render() { ... }
}
```

Generated function structure (ordering is guaranteed):

```tsx
export function MyComponent(props: {}) {
  // 1. @use calls, in source order
  const resultA = usePrimitiveA(localValue);
  const resultB = usePrimitiveB(resultA);

  // 2. @state declarations
  const [localValue, setLocalValue] = useState(() => '');

  // 3. @ref declarations
  // 4. Derived const expressions (getters)
  // 5. Local function declarations (methods)
  // 6. useEffect / useLayoutEffect calls
  // 7. return (render output)
}
```

:::warning
Note that in the example above, `localValue` is referenced in the `@use` args factory before it is declared as `@state`. This is valid because the generated hook call uses the runtime variable, and in the generated output the state variable is available in the closure. The compiler validates that the reference is to a known field.
:::

## Primitives within Primitives

A `Primitive` can use `@use` to compose other Primitives:

```tsx
// src/primitives/UseSearch.ts
import { Primitive, state, effect, use } from '@meridian/meridian';
import { UseDebounce } from './UseDebounce';

interface SearchResult {
  id: string;
  title: string;
}

export class UseSearch extends Primitive<SearchResult[]> {
  @state results: SearchResult[] = [];
  @state loading = false;

  @use(UseDebounce, () => [this.query, this.delay])
  debouncedQuery!: string;

  constructor(private query: string, private delay: number = 300) {
    super();
  }

  @effect
  async fetch(): Promise<void> {
    if (!this.debouncedQuery) {
      this.results = [];
      return;
    }
    this.loading = true;
    const r = await fetch(`/api/search?q=${encodeURIComponent(this.debouncedQuery)}`);
    this.results = await r.json();
    this.loading = false;
  }

  resolve(): SearchResult[] {
    return this.results;
  }
}
```

## When to use Primitive vs inline logic

Use a `Primitive` when:

- The logic is used in more than one component.
- The logic is complex enough to warrant isolation and independent testing.
- You want to give the logic a named abstraction (like `useDebounce`, `useLocalStorage`).

Use inline `@state` and `@effect` in the component when:

- The logic is specific to a single component.
- The logic is simple enough that extracting it would add more indirection than clarity.

There is no performance cost to a `Primitive` — it compiles to an ordinary custom hook call, exactly as if you had written the hook manually.

## Related

- [`@use` API reference](../api/use.md)
- [`Primitive<T>` API reference](../api/primitive.md)
- [Debounce example](../examples/debounce.md)
- [Search Box example](../examples/search-box.md)
