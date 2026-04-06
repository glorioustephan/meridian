---
title: Component<Props>
---

# Component&lt;Props&gt;

`Component<Props>` is the base class for interactive client components. It lives in the `@meridian/meridian` package. A class that extends `Component<Props>` is transformed by the Meridian compiler into a React function component.

## Import

```ts
import { Component } from '@meridian/meridian';
```

## Type signature

```ts
export abstract class Component<Props = {}> {
  declare readonly props: Readonly<Props>;
  abstract render(): React.ReactNode;
}
```

The class is abstract — it cannot be instantiated directly. You must extend it and implement `render()`.

## Type parameter

`Props` is the type of the component's props. It defaults to `{}` (empty object) if omitted.

```tsx
// No props
class SimpleBox extends Component { ... }

// Typed props
class Button extends Component<{ label: string; onClick: () => void }> { ... }

// Props as a separate interface
interface CardProps {
  title: string;
  body: string;
  featured?: boolean;
}
class Card extends Component<CardProps> { ... }
```

## The props property

`this.props` is typed as `Readonly<Props>`. It is read-only — you cannot assign to `this.props` or mutate its properties. Attempting to do so is a TypeScript compile error.

In the generated output, `this.props` accesses are rewritten to `props.x`:

```tsx
// Meridian source
render() {
  return <h1>{this.props.title}</h1>;
}

// Generated output
function MyComponent(props: MyComponentProps) {
  return <h1>{props.title}</h1>;
}
```

Props can be used as initial values for `@state` fields:

```tsx
@state count = this.props.initialCount ?? 0;
```

This is evaluated once at mount. Subsequent prop changes do not reset the state. If you need to reset state when a prop changes, use `@effect`:

```tsx
@effect
syncCountFromProp(): void {
  // This effect re-runs when props.initialCount changes
  // Use only if resetting state on prop change is intentional
  this.count = this.props.initialCount ?? 0;
}
```

## The render method

`render()` must be implemented and must return `React.ReactNode`. It becomes the body of the generated function component (after all hook calls):

```tsx
render(): React.ReactNode {
  return (
    <div>
      <h1>{this.props.title}</h1>
      <p>{this.count}</p>
    </div>
  );
}
```

Inside `render()`, all `this.x` references are rewritten to their lexical counterparts in the generated output. See the [Components guide lowering table](../guide/components.md#lowering-reference-table) for the complete mapping.

## Valid decorators on Component members

| Decorator | Valid on | Description |
|---|---|---|
| `@state` | Instance fields | Declares reactive state |
| `@ref` | Instance fields | Declares a React ref |
| `@use(P, factory)` | Instance fields | Composes a Primitive |
| `@effect` | Instance methods | Registers a `useEffect` |
| `@effect.layout` | Instance methods | Registers a `useLayoutEffect` |

No other decorators are supported in v1. Using an unknown decorator triggers diagnostic M003.

## Supported member forms

| Member | Behavior |
|---|---|
| `@state field = init` | Reactive state, lowers to `useState` |
| `@ref field` | Ref object, lowers to `useRef(null)` |
| `@use(P, fn) field` | Primitive hook call |
| `get name()` | Pure derived expression, lowers to `const name = ...` |
| `method()` | Event handler or behavior, lowers to local `function` |
| `async method()` | Async event handler, lowers to `async function` |
| `render()` | Return the JSX tree |

## Restrictions

- `Component` must not extend another `Component` or any class that has decorated members. Decorated inheritance is not supported in v1 and triggers diagnostic M002. Reusable reactive behavior belongs in `Primitive<T>`.
- `Component` files must start with `'use client'`. Missing this directive triggers diagnostic M001.
- `Component` must have a `render()` method. Missing `render()` triggers diagnostic M006.
- Static class members are not processed by the Meridian compiler. Use plain TypeScript static properties and methods if needed.
- Private fields (`#field`) are not supported in reactive contexts. Reads of `#field` in effects or getters trigger diagnostic M008.

## TypeScript example

```tsx
'use client';

import { Component, state, ref, effect } from '@meridian/meridian';

interface CounterProps {
  initialCount?: number;
  step?: number;
  onCountChange?: (count: number) => void;
}

export class Counter extends Component<CounterProps> {
  @state count = this.props.initialCount ?? 0;

  get step(): number {
    return this.props.step ?? 1;
  }

  increment(): void {
    this.count = this.count + this.step;
  }

  decrement(): void {
    this.count = this.count - this.step;
  }

  @effect
  notifyChange(): void {
    this.props.onCountChange?.(this.count);
  }

  render(): React.ReactNode {
    return (
      <div>
        <button onClick={this.decrement}>-{this.step}</button>
        <span>{this.count}</span>
        <button onClick={this.increment}>+{this.step}</button>
      </div>
    );
  }
}
```

## What the compiler does

Given the above class, the compiler:

1. Validates that `'use client'` is present (M001 if missing).
2. Validates that `Counter` directly extends `Component<CounterProps>` with no intermediate decorated class (M002 if not).
3. Validates that `render()` is present (M006 if missing).
4. Emits `const [count, setCount] = useState(() => props.initialCount ?? 0)` for `@state count`.
5. Emits `const step = props.step ?? 1` for `get step()`.
6. Emits `function increment() { setCount(count + step); }` for `increment()`.
7. Emits `function decrement() { setCount(count - step); }` for `decrement()`.
8. Analyzes `@effect notifyChange()`: sees `this.props.onCountChange` and `this.count`, emits `useEffect(() => { props.onCountChange?.(count); }, [count, props.onCountChange])`.
9. Emits the `render()` body with all `this.x` references rewritten.

## Related

- [Components guide](../guide/components.md)
- [`Primitive<T>` API reference](./primitive.md)
- [`@state` API reference](./state.md)
- [`@effect` API reference](./effect.md)
