---
title: '@use'
---

# @use

`@use(Primitive, argsFactory)` is a field decorator that composes a `Primitive<T>` into a `Component` or another `Primitive`. It generates a call to the Primitive's compiled custom hook.

## Import

```ts
import { use } from '@meridian/meridian';
```

Note: the export is named `use`, not `Use`. Use it as `@use(...)` in decorator position.

## Decorator signature

```ts
export declare function use<TArgs extends unknown[], TReturn>(
  primitive: new (...args: TArgs) => Primitive<TReturn>,
  argsFactory: () => TArgs,
): (value: undefined, context: ClassFieldDecoratorContext) => void;
```

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `primitive` | `new (...args) => Primitive<TReturn>` | The Primitive class to use. |
| `argsFactory` | `() => TArgs` | An inline arrow function that returns the constructor arguments to pass to the hook on each render. |

## Basic usage

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
      <>
        <input
          value={this.query}
          onChange={e => { this.query = e.target.value; }}
        />
        <SearchResults query={this.debouncedQuery} />
      </>
    );
  }
}
```

## How it lowers

`@use(UseDebounce, () => [this.query, 300])` compiles to:

```tsx
const debouncedQuery = useUseDebounce(query, 300);
```

The field name (`debouncedQuery`) becomes the local variable name. The args factory `() => [this.query, 300]` is evaluated to `[query, 300]` at render time, with `this.query` rewritten to the local state variable `query`.

The complete generated structure for the example above:

```tsx
export function SearchPage(props: {}) {
  // @use calls appear at the top, before @state declarations
  const debouncedQuery = useUseDebounce(query, 300);

  const [query, setQuery] = useState(() => '');

  return (
    <>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); }}
      />
      <SearchResults query={debouncedQuery} />
    </>
  );
}
```

## The args factory

The `argsFactory` parameter is an arrow function that returns the array of arguments to pass to the hook. It is called on every render.

### What is allowed

The args factory must be a statically analyzable inline arrow function. Each element of the returned array must be a direct `this.stateField` read, `this.props.x` read, or a literal value:

```tsx
// Valid — state field
@use(UseDebounce, () => [this.query, 300])
debouncedQuery!: string;

// Valid — prop
@use(UseDebounce, () => [this.query, this.props.debounceMs])
debouncedQuery!: string;

// Valid — literal
@use(SomePrimitive, () => ['en-US', true])
result!: SomeResult;

// Valid — multiple args from state and props
@use(UsePagination, () => [this.items, this.props.pageSize])
page!: PageResult<Item>;
```

### What is rejected

The compiler emits M008 if the args factory contains expressions it cannot analyze statically:

```tsx
// Invalid — method call result cannot be statically analyzed
@use(UseDebounce, () => [this.query, this.getDelay()])
debouncedQuery!: string;

// Invalid — computed access
@use(UseSomething, () => [this[this.props.key]])
result!: unknown;
```

:::warning
If the args factory contains an invalid expression, the compiler reports M008 and halts code generation for the entire file. Restructure the args to use direct `this.stateField` or `this.props.x` reads.
:::

## Field type annotation

The type annotation on the `@use` field declares what type the Primitive's `resolve()` returns. Use `!:` (definite assignment assertion) because the field has no initializer in Meridian source:

```tsx
@use(UseDebounce, () => [this.query, 300])
debouncedQuery!: string;   // ← string is the return type of UseDebounce.resolve()

@use(UseSearch, () => [this.query])
searchResults!: SearchResult[];

@use(UseBoolean, () => [])
isOpen!: boolean;
```

TypeScript will check that the declared type is compatible with the Primitive's `T` type parameter.

## Hook ordering guarantee

All `@use` calls are emitted at the top of the generated function body, before `@state`, `@ref`, derived expressions, and effects. Within the `@use` group, calls are emitted in source order.

This ensures deterministic hook ordering and satisfies React's rules of hooks, even when `@use` fields reference each other or reference state fields that are declared later:

```tsx
export class ComposedComponent extends Component {
  @state query = '';

  @use(UseDebounce, () => [this.query, 300])
  debouncedQuery!: string;

  @use(UseSearch, () => [this.debouncedQuery])
  results!: SearchResult[];

  render() { ... }
}
```

Generated ordering:

```tsx
export function ComposedComponent(props: {}) {
  // Hook calls first, in source order
  const debouncedQuery = useUseDebounce(query, 300);
  const results = useUseSearch(debouncedQuery);

  // State declarations after
  const [query, setQuery] = useState(() => '');

  // ...
}
```

## Using @use in a Primitive

`@use` can also appear in a `Primitive<T>` to compose other Primitives:

```ts
export class UseSearch extends Primitive<SearchResult[]> {
  @use(UseDebounce, () => [this.query, this.delay])
  debouncedQuery!: string;

  constructor(private query: string, private delay: number = 300) {
    super();
  }

  @state results: SearchResult[] = [];

  @effect
  async fetch(): Promise<void> {
    if (!this.debouncedQuery) {
      this.results = [];
      return;
    }
    const r = await fetch(`/api/search?q=${encodeURIComponent(this.debouncedQuery)}`);
    this.results = await r.json();
  }

  resolve(): SearchResult[] {
    return this.results;
  }
}
```

## Restrictions

- The args factory must be an inline arrow function literal — you cannot pass a reference to a pre-defined function.
- Each element in the returned array must be a statically resolvable expression.
- `@use` cannot be applied to `static` class fields.
- Circular `@use` dependencies (Primitive A uses Primitive B, Primitive B uses Primitive A) are a build error.

## Related

- [Primitives guide](../guide/primitives.md)
- [`Primitive<T>` API reference](./primitive.md)
- [Diagnostics reference](./diagnostics.md#m008)
- [Search Box example](../examples/search-box.md)
