---
title: '@state'
---

# @state

`@state` is a field decorator that declares a reactive state field. It compiles to a `useState` hook call in the generated React output.

## Import

```ts
import { state } from 'meridian';
```

Note: the export is named `state`, not `State`. Use it as `@state` in decorator position.

## Decorator signature

```ts
export declare const state: (
  value: undefined,
  context: ClassFieldDecoratorContext
) => void;
```

`@state` targets **standard decorators** (TypeScript 5.x / TC39 `2023-11`). It does not use `experimentalDecorators`.

## Basic usage

```tsx
'use client';

import { Component, state } from 'meridian';

export class Counter extends Component {
  @state count = 0;
  @state label = 'default';
  @state items: string[] = [];
  @state user: User | null = null;
}
```

## How it lowers

`@state field = initializer` compiles to:

```tsx
const [field, setField] = useState(() => initializer);
```

The initial value is always wrapped in a factory function so it is evaluated once at mount, not on every render. This matches the lazy initialization form of `useState`.

### Full lowering example

```tsx
// Meridian source
@state count = this.props.initialCount ?? 0;

// Generated output
const [count, setCount] = useState(() => props.initialCount ?? 0);
```

## Initial value expressions

The initializer can be any TypeScript expression that is valid in the position where the field is declared. Common patterns:

```tsx
// Literal value
@state count = 0;
@state name = '';
@state open = false;
@state items: string[] = [];

// Expression from props
@state query = this.props.defaultQuery ?? '';
@state pageSize = this.props.pageSize ?? 20;

// Object literal
@state position = { x: 0, y: 0 };

// Conditional
@state mode: 'light' | 'dark' = this.props.prefersDark ? 'dark' : 'light';
```

The initializer is captured once. If props change after mount, the state field is not reset unless you explicitly write an `@effect` that updates it.

## Reading state

Read `this.stateField` anywhere in the class body — in `render()`, methods, getters, and effects. In the generated output, all reads rewrite to the local variable:

```tsx
// Meridian source
render() {
  return <p>{this.count}</p>;
}

// Generated output
return <p>{count}</p>;
```

## Mutating state

Assign directly to `this.stateField` to update the state. The compiler rewrites the assignment to a setter call:

```tsx
// Meridian source
increment(): void {
  this.count = this.count + 1;
}

// Generated output
function increment() {
  setCount(count + 1);
}
```

Assignments to state fields in async methods and inline arrow functions in JSX are also supported:

```tsx
// In an async method
async save(): Promise<void> {
  this.saving = true;
  await api.save(this.data);
  this.saving = false;
}

// In an inline handler in JSX
render() {
  return <input onChange={e => { this.value = e.target.value; }} />;
}
```

## Type inference

TypeScript infers the state field type from the initializer. Provide an explicit type annotation when inference is insufficient:

```tsx
// Type inferred as number
@state count = 0;

// Type annotation required for union types
@state mode: 'loading' | 'success' | 'error' = 'loading';

// Type annotation required when initializer is null
@state user: User | null = null;
```

## Restrictions

- **No mutation in getters.** Assigning to a `@state` field inside a getter is a build error. Getters must be pure derived expressions.
- **No static fields.** `@state` cannot be applied to `static` class fields. Static members are not processed by the Meridian compiler.
- **No `#private` state.** Private class fields (`#field`) cannot be decorated with `@state`. The Meridian compiler cannot safely track reads of private fields.
- **Direct assignment only.** In v1, state mutation through computed property access (`this[dynamicKey] = value`) is not supported and triggers diagnostic M008.

## Arrays and objects

State fields can hold arrays and objects, but follow React's immutability conventions — produce new values rather than mutating in place:

```tsx
@state items: string[] = [];
@state config: Config = defaultConfig;

// Correct — produces a new array
addItem(item: string): void {
  this.items = [...this.items, item];
}

// Correct — produces a new object
updateConfig(patch: Partial<Config>): void {
  this.config = { ...this.config, ...patch };
}

// Wrong — mutates in place, React will not re-render
addItemWrong(item: string): void {
  this.items.push(item);
}
```

## Related

- [Components guide — State section](../guide/components.md#state-with-state)
- [`@ref` API reference](./ref.md) — for non-reactive mutable values
- [`Component<Props>` API reference](./component.md)
