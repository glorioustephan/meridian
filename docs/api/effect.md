---
title: '@effect'
---

# @effect

`@effect` and `@effect.layout` are method decorators that register side effects with statically inferred dependency arrays.

## Import

```ts
import { effect } from 'meridian';
```

Use as `@effect` or `@effect.layout` in decorator position.

## Lowering table

| Meridian decorator | Generated hook | When it runs |
|---|---|---|
| `@effect` | `useEffect` | After paint, asynchronously |
| `@effect.layout` | `useLayoutEffect` | After DOM update, before paint |

## Decorator signatures

```ts
export declare const effect: {
  // @effect
  (value: Function, context: ClassMethodDecoratorContext): void;
  // @effect.layout
  layout: (value: Function, context: ClassMethodDecoratorContext) => void;
};
```

## Basic usage

```tsx
'use client';

import { Component, state, effect } from 'meridian';

export class PageTitle extends Component<{ title: string }> {
  @effect
  setTitle(): void {
    document.title = this.props.title;
  }

  render() {
    return <h1>{this.props.title}</h1>;
  }
}
```

Generated:

```tsx
useEffect(() => {
  document.title = props.title;
}, [props.title]);
```

## Dependency inference rules

The compiler analyzes the effect method body and collects dependencies by type:

| Access in method body | Becomes dependency |
|---|---|
| `this.stateField` | `stateField` |
| `this.props.x` | `props.x` |
| `this.getter` | All state/props read by the getter (recursively resolved) |
| `this.refField.current` | (not a dependency — refs are stable) |
| Method calls (`this.method()`) | The method itself becomes a dep only if it is passed to a child; direct calls are inlined |

When the effect body reads no reactive values, the compiler emits `[]`, and the effect runs once on mount.

### Getter dependency flattening

If an effect reads a getter, the compiler resolves the getter's own dependencies recursively and adds them to the effect's deps array:

```tsx
@state items: string[] = [];
@state filter = '';

get filteredItems(): string[] {
  return this.items.filter(i => i.includes(this.filter));
}

@effect
logFiltered(): void {
  console.log(this.filteredItems.length);
  // filteredItems depends on (items, filter) → deps: [items, filter]
}
```

Generated:

```tsx
useEffect(() => {
  console.log(filteredItems.length);
}, [items, filter]);
```

## Cleanup functions

Return a function from the effect method to register a cleanup callback:

```tsx
@effect
subscribe(): () => void {
  const unsub = store.subscribe(this.handleChange);
  return () => unsub();
}
```

Generated:

```tsx
useEffect(() => {
  const unsub = store.subscribe(handleChange);
  return () => unsub();
}, [handleChange]);
```

The return type annotation `(): () => void` is optional. The compiler accepts any method that returns a function.

## Async effects

### Non-async method with inner IIFE

```tsx
@effect
fetchData(): void {
  (async () => {
    const data = await api.get(this.props.resourceId);
    this.data = data;
  })();
}
```

### Async method (compiler wraps automatically)

If the method is declared `async`, the compiler wraps the body in an inner IIFE automatically:

```tsx
@effect
async fetchData(): Promise<void> {
  const data = await api.get(this.props.resourceId);
  this.data = data;
}
```

Both forms generate:

```tsx
useEffect(() => {
  (async () => {
    const data = await api.get(props.resourceId);
    setData(data);
  })();
}, [props.resourceId]);
```

:::warning
An `async` effect method cannot return a cleanup function. To combine async logic and cleanup, use the non-async form with an explicit cleanup return:

```tsx
@effect
fetchWithAbort(): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const r = await fetch(this.props.url, { signal: controller.signal });
      this.data = await r.json();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.error = err as Error;
    }
  })();
  return () => controller.abort();
}
```
:::

## @effect.layout

Use `@effect.layout` for DOM measurements and mutations that must happen before the browser paints:

```tsx
'use client';

import { Component, state, ref, effect } from 'meridian';

export class Tooltip extends Component<{ text: string }> {
  @ref tooltipEl!: React.RefObject<HTMLDivElement>;
  @state position = { top: 0, left: 0 };

  @effect.layout
  positionTooltip(): void {
    const rect = this.tooltipEl.current?.getBoundingClientRect();
    if (rect) {
      this.position = { top: rect.bottom + 8, left: rect.left };
    }
  }

  render() {
    return (
      <div ref={this.tooltipEl}>
        <div
          style={{
            position: 'fixed',
            top: this.position.top,
            left: this.position.left,
          }}
        >
          {this.props.text}
        </div>
      </div>
    );
  }
}
```

Generated:

```tsx
useLayoutEffect(() => {
  const rect = tooltipEl.current?.getBoundingClientRect();
  if (rect) {
    setPosition({ top: rect.bottom + 8, left: rect.left });
  }
}, []);
```

## Rejected patterns (diagnostic M008)

The compiler emits M008 and fails the build for patterns that cannot be analyzed statically:

### Computed property access

```tsx
@effect
bad(): void {
  const key = this.props.field;
  console.log(this[key]); // Error: M008
}
```

**Fix:** access the state field directly — `this.someField` instead of `this[dynamicKey]`.

### Iterating over this

```tsx
@effect
bad(): void {
  for (const k in this) { // Error: M008
    console.log(k);
  }
}
```

**Fix:** maintain an explicit list of the values you need to iterate.

### Object.keys(this)

```tsx
@effect
bad(): void {
  Object.keys(this).forEach(k => { // Error: M008
    console.log(k);
  });
}
```

**Fix:** use an explicit data structure.

### Private field reads

```tsx
#secret = 'hidden';

@effect
bad(): void {
  console.log(this.#secret); // Error: M008
}
```

**Fix:** use a `@state` or `@ref` field instead.

## Related

- [Effects & Dependencies guide](../guide/effects.md)
- [Diagnostics reference](./diagnostics.md)
- [`Component<Props>` API reference](./component.md)
- [`Primitive<T>` API reference](./primitive.md)
