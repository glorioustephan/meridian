---
title: '@ref'
---

# @ref

`@ref` is a field decorator that declares a React ref. It compiles to a `useRef(null)` call in the generated output. Ref values do not trigger re-renders when they change.

## Import

```ts
import { ref } from 'meridian';
```

Note: the export is named `ref`, not `Ref`. Use it as `@ref` in decorator position.

## Decorator signature

```ts
export declare const ref: (
  value: undefined,
  context: ClassFieldDecoratorContext
) => void;
```

## How it lowers

`@ref fieldName` compiles to:

```tsx
const fieldName = useRef(null);
```

The initial value is always `null`. To specify the type of the ref's content, use a type annotation on the field:

```tsx
@ref inputEl!: React.RefObject<HTMLInputElement>;
// Generated: const inputEl = useRef<HTMLInputElement>(null);
```

The `!` non-null assertion is required because the field has no initializer in the Meridian source — the compiler generates the `useRef` call instead.

## Basic usage

### DOM element refs

The most common use of `@ref` is attaching to DOM elements via the `ref` prop:

```tsx
'use client';

import { Component, ref, effect } from 'meridian';

export class AutoFocus extends Component {
  @ref inputEl!: React.RefObject<HTMLInputElement>;

  @effect
  focusOnMount(): void {
    this.inputEl.current?.focus();
  }

  render() {
    return <input ref={this.inputEl} type="text" placeholder="Focus on mount" />;
  }
}
```

Generated output:

```tsx
export function AutoFocus(props: {}) {
  const inputEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputEl.current?.focus();
  }, []);

  return <input ref={inputEl} type="text" placeholder="Focus on mount" />;
}
```

### Mutable non-reactive values

Use `@ref` for mutable values that should not trigger re-renders when they change. Common examples include timers, subscription handles, and abort controllers:

```tsx
'use client';

import { Component, state, ref, effect } from 'meridian';

export class Poller extends Component<{ url: string; intervalMs: number }> {
  @state data: unknown = null;
  @ref intervalId!: React.RefObject<ReturnType<typeof setInterval> | null>;

  @effect
  startPolling(): () => void {
    this.intervalId.current = setInterval(async () => {
      const res = await fetch(this.props.url);
      this.data = await res.json();
    }, this.props.intervalMs);

    return () => {
      if (this.intervalId.current !== null) {
        clearInterval(this.intervalId.current);
      }
    };
  }

  render() {
    return <pre>{JSON.stringify(this.data, null, 2)}</pre>;
  }
}
```

The `intervalId` ref stores the timer ID so the cleanup function can clear it. Because `intervalId.current` is not a reactive dependency (it is a ref), changes to it do not re-run the effect.

## Accessing ref values

Access `this.refField.current` anywhere in the class body — in methods, effects, and the `render()` method. The compiler rewrites `this.refField.current` to `refField.current` in the generated output.

```tsx
// Meridian source
this.inputEl.current?.focus();

// Generated output
inputEl.current?.focus();
```

## Ref vs state

| Feature | `@state` | `@ref` |
|---|---|---|
| Triggers re-render on change | Yes | No |
| Value persists across renders | Yes | Yes |
| Accessible in effects | Yes | Yes |
| Can be attached to DOM elements | No | Yes (via `ref` prop) |
| Dependency in effects | Yes | No |
| Initial value | From initializer | Always `null` |

Use `@state` when you need React to re-render when the value changes. Use `@ref` when you need to hold a value across renders without triggering re-renders — DOM nodes, imperative API handles, timer IDs, and abort controllers are all good candidates.

## Refs in effects

Refs are not reactive dependencies. The compiler does not include ref reads in inferred dependency arrays:

```tsx
@ref containerEl!: React.RefObject<HTMLDivElement>;
@state width = 0;

@effect.layout
measure(): void {
  // containerEl is a ref — not included in deps
  // width setter is a state mutation — deps are empty
  this.width = this.containerEl.current?.offsetWidth ?? 0;
}
// Generated: useLayoutEffect(() => { ... }, []);
```

This matches React's documented guidance: ref objects are stable across renders, so they do not need to appear in dependency arrays.

## Type annotations

Type annotations on `@ref` fields are optional but recommended for type safety on `ref.current`:

```tsx
// Untyped — ref.current is unknown
@ref containerEl!: React.RefObject<unknown>;

// Typed — ref.current is HTMLDivElement | null
@ref containerEl!: React.RefObject<HTMLDivElement>;

// Typed for non-DOM refs
@ref abortCtrl!: React.RefObject<AbortController | null>;
@ref timerId!: React.RefObject<number | null>;
```

## Restrictions

- `@ref` fields cannot have initializers in Meridian source. The initial value is always `null` in the generated `useRef(null)` call.
- Reads of `this.refField.current` inside effects are not included in dependency arrays. This is correct React behavior — do not add ref reads to dependency arrays manually.
- `@ref` cannot be applied to `static` class fields.

## Related

- [Components guide — Refs section](../guide/components.md#refs-with-ref)
- [`@state` API reference](./state.md)
- [`Component<Props>` API reference](./component.md)
