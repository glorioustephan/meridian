---
title: Primitive<T>
---

# Primitive&lt;T&gt;

`Primitive<T>` is the base class for reusable stateful logic. A class that extends `Primitive<T>` compiles to a custom React hook. It lives in the `@meridian/meridian` package.

## Import

```ts
import { Primitive } from '@meridian/meridian';
```

## Type signature

```ts
export abstract class Primitive<T> {
  abstract resolve(): T;
}
```

The class is abstract — it cannot be instantiated directly. You must extend it and implement `resolve()`.

## Type parameter

`T` is the return type of the compiled hook. It is the type returned by `resolve()`:

```ts
class UseBoolean extends Primitive<boolean> {
  @state value = false;
  toggle() { this.value = !this.value; }
  resolve(): boolean { return this.value; }
}
// Compiles to: function useUseBoolean(): boolean
```

For Primitives that return structured data, use an interface or object type:

```ts
interface UseToggleReturn {
  value: boolean;
  toggle: () => void;
  setTrue: () => void;
  setFalse: () => void;
}

class UseToggle extends Primitive<UseToggleReturn> {
  @state value = false;
  toggle() { this.value = !this.value; }
  setTrue() { this.value = true; }
  setFalse() { this.value = false; }
  resolve(): UseToggleReturn {
    return {
      value: this.value,
      toggle: this.toggle,
      setTrue: this.setTrue,
      setFalse: this.setFalse,
    };
  }
}
```

## The resolve method

`resolve()` defines what the hook returns. It must be implemented and must return a value of type `T`. In the generated output, `resolve()` becomes the hook's return statement.

`resolve()` is a pure method — it should not have side effects, read refs, or perform async operations. It runs on every render (like any hook return expression).

```ts
// Valid
resolve(): string {
  return this.current;
}

// Valid — can call other methods or access getters
resolve(): ProcessedData {
  return this.processedData; // where processedData is a getter
}

// Invalid — do not use resolve() for side effects
resolve(): void {
  this.someState = 'changed'; // Do not do this
}
```

## Constructor parameter capture

Constructor parameters become the hook's function parameters in the generated output. Declare them with access modifiers (`private`, `public`, `readonly`) to make them available as `this.paramName` within the class body:

```ts
class UseDebounce<T> extends Primitive<T> {
  @state current: T;

  constructor(private value: T, private delay: number) {
    super();
    this.current = value;
  }

  @effect
  sync(): () => void {
    const id = setTimeout(() => { this.current = this.value; }, this.delay);
    return () => clearTimeout(id);
  }

  resolve(): T {
    return this.current;
  }
}
```

Generated hook signature:

```ts
function useUseDebounce<T>(value: T, delay: number): T
```

Constructor parameters are treated as dependencies in effects and getters, just like `this.props` in a `Component`. The compiler tracks reads of `this.value` and `this.delay` and includes them in inferred dependency arrays.

## Hook naming convention

The compiler generates a hook function named `use` + the class name. For a class named `UseDebounce`, the generated function is `useUseDebounce`. For a class named `LocalStorage`, the generated function is `useLocalStorage`.

```
Class name       Generated hook name
UseDebounce   →  useUseDebounce
LocalStorage  →  useLocalStorage
Toggle        →  useToggle
```

To avoid the double `use` prefix, name your class without the `Use` prefix — but note that many teams prefer to keep the `Use` prefix in class names for clarity in Meridian source.

## Valid decorators on Primitive members

| Decorator | Valid on | Description |
|---|---|---|
| `@state` | Instance fields | Reactive state within the hook |
| `@ref` | Instance fields | A React ref within the hook |
| `@use(P, factory)` | Instance fields | Composes another Primitive |
| `@effect` | Instance methods | A `useEffect` within the hook |
| `@effect.layout` | Instance methods | A `useLayoutEffect` within the hook |

## Restrictions

- Primitive files do not need `'use client'`. Primitives are compiled to hook functions, not full client modules. Only `Component` modules need the directive.
- `Primitive` must not extend another `Primitive` or a class with decorated members. Decorated inheritance is not supported.
- `Primitive` must have a `resolve()` method. Missing `resolve()` triggers diagnostic M007.
- Primitives are client-only in v1. Do not import Primitive-compiled hooks in Server Components.

## How it compiles

Given this Primitive:

```ts
export class UseCounter extends Primitive<number> {
  @state count = 0;
  increment() { this.count++; }
  resolve(): number { return this.count; }
}
```

The compiler generates:

```ts
export function useUseCounter(): number {
  const [count, setCount] = useState(() => 0);

  function increment() {
    setCount(count + 1);
  }

  return count;
}
```

## Consuming a Primitive

Use the `@use` decorator in a `Component` or another `Primitive` to call the generated hook:

```tsx
'use client';

import { Component, use } from '@meridian/meridian';
import { UseDebounce } from '@meridian/primitives/UseDebounce';

export class SearchBox extends Component<{ placeholder?: string }> {
  @state query = '';

  @use(UseDebounce, () => [this.query, 300])
  debouncedQuery!: string;

  render() {
    return (
      <div>
        <input
          value={this.query}
          onChange={e => { this.query = e.target.value; }}
          placeholder={this.props.placeholder}
        />
        <SearchResults query={this.debouncedQuery} />
      </div>
    );
  }
}
```

See the [`@use` API reference](./use.md) and the [Primitives guide](../guide/primitives.md) for full details.

## Related

- [Primitives guide](../guide/primitives.md)
- [`@use` API reference](./use.md)
- [`Component<Props>` API reference](./component.md)
- [Debounce example](../examples/debounce.md)
