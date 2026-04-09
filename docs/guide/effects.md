---
title: Effects & Dependencies
---

# Effects & Dependencies

Meridian provides two effect decorators that map directly to React's effect hooks:

| Decorator | Lowers to | Use for |
|---|---|---|
| `@effect` | `useEffect` | Side effects that run after paint |
| `@effect.layout` | `useLayoutEffect` | DOM measurements and mutations before paint |

The key advantage over writing `useEffect` directly is that **Meridian infers the dependency array at compile time**. You do not write dependency arrays. If the compiler cannot determine the dependencies statically, it emits a build error.

## @effect — side effects

Decorate a method with `@effect` to run it as a side effect after the component renders:

```tsx
'use client';

import { Component, state, effect } from 'meridian';

export class DocumentTitle extends Component<{ title: string }> {
  @effect
  updateTitle(): void {
    document.title = this.props.title;
  }

  render() {
    return <h1>{this.props.title}</h1>;
  }
}
```

Generated output:

```tsx
useEffect(() => {
  document.title = props.title;
}, [props.title]);
```

The compiler scanned the method body, found `this.props.title`, and emitted `[props.title]` as the dependency array. No manual maintenance required.

## @effect.layout — layout effects

Use `@effect.layout` for effects that need to run synchronously after the DOM has been updated but before the browser paints. The canonical use case is measuring DOM element dimensions:

```tsx
'use client';

import { Component, state, ref, effect } from 'meridian';

export class MeasuredBox extends Component {
  @ref containerEl!: React.RefObject<HTMLDivElement>;
  @state height = 0;

  @effect.layout
  measure(): void {
    this.height = this.containerEl.current?.getBoundingClientRect().height ?? 0;
  }

  render() {
    return (
      <div ref={this.containerEl}>
        <p>Container height: {this.height}px</p>
      </div>
    );
  }
}
```

Generated output:

```tsx
useLayoutEffect(() => {
  setHeight(containerEl.current?.getBoundingClientRect().height ?? 0);
}, []);
```

The `containerEl` ref is not a reactive dependency — ref objects are stable and do not need to appear in dependency arrays. The compiler knows this and correctly omits the ref from the deps array.

## Static dependency inference

The compiler infers the dependency array for every effect method by performing a static analysis of the method body. The inference rules are:

### Recognized dependencies

**State field reads:** `this.stateField` resolves to the state variable and adds it to the dep array.

```tsx
@effect
logCount(): void {
  console.log('Count:', this.count);
  // Deps: [count]
}
```

**Prop reads:** `this.props.x` resolves to the prop and adds `props.x` to the dep array. Because props is a single object reference in the generated output, Meridian emits individual prop accesses as dependencies.

```tsx
@effect
syncEndpoint(): void {
  externalApi.setEndpoint(this.props.endpoint);
  // Deps: [props.endpoint]
}
```

**Getter reads:** `this.getter` resolves the getter and recursively adds its concrete state and prop dependencies. The getter itself does not appear in the dep array — only the underlying state and props it reads do.

```tsx
@state items: string[] = [];
@state filter = '';

get filteredItems(): string[] {
  return this.items.filter(i => i.includes(this.filter));
}

@effect
logFiltered(): void {
  console.log('Filtered count:', this.filteredItems.length);
  // filteredItems depends on (items, filter)
  // Deps: [items, filter]
}
```

**Mixed reads:** when an effect reads multiple state fields, props, and getters, all concrete dependencies are collected and deduplicated:

```tsx
@state userId = '';
@state locale = 'en';

get apiUrl(): string {
  return `/api/${this.locale}/users/${this.userId}`;
}

@effect
async fetch(): Promise<void> {
  const data = await request(this.apiUrl);
  // apiUrl depends on (locale, userId)
  // Deps: [locale, userId]
}
```

### Empty dependency arrays

If an effect method reads no state, props, or getters — it only reads refs or external variables — the compiler emits an empty dependency array `[]`, meaning the effect runs once on mount:

```tsx
@effect
onMount(): () => void {
  analytics.track('component_mounted');
  return () => analytics.track('component_unmounted');
}
// Deps: []
```

## Cleanup functions

Return a function from an `@effect` method to register a cleanup callback. The cleanup runs before the next effect execution and on unmount, matching React's `useEffect` cleanup contract.

```tsx
@effect
subscribe(): () => void {
  const subscription = eventBus.subscribe(this.props.topic, this.handleEvent);
  return () => subscription.unsubscribe();
}
```

Generated output:

```tsx
useEffect(() => {
  const subscription = eventBus.subscribe(props.topic, handleEvent);
  return () => subscription.unsubscribe();
}, [props.topic, handleEvent]);
```

The return type annotation `(): () => void` is optional but recommended for clarity.

## Async effects

Async methods are supported with the inner async IIFE pattern. The `@effect` method itself must not be `async` — React effect callbacks cannot be async functions. Instead, the compiler wraps the async body in an immediately-invoked async function:

```tsx
@effect
fetchUser(): void {
  (async () => {
    this.loading = true;
    try {
      const user = await api.getUser(this.props.userId);
      this.user = user;
    } finally {
      this.loading = false;
    }
  })();
}
```

Alternatively, you can declare the method as `async` and the compiler will apply the IIFE wrapping automatically:

```tsx
@effect
async fetchUser(): Promise<void> {
  this.loading = true;
  try {
    const user = await api.getUser(this.props.userId);
    this.user = user;
  } finally {
    this.loading = false;
  }
}
```

Both forms generate:

```tsx
useEffect(() => {
  (async () => {
    setLoading(true);
    try {
      const user = await api.getUser(props.userId);
      setUser(user);
    } finally {
      setLoading(false);
    }
  })();
}, [props.userId]);
```

:::warning
You cannot return a cleanup function from an async `@effect` method. If you need both async logic and cleanup, use the non-async form with an inner IIFE:

```tsx
@effect
fetchWithCleanup(): () => void {
  const controller = new AbortController();
  (async () => {
    const data = await fetch(this.url, { signal: controller.signal });
    this.data = await data.json();
  })();
  return () => controller.abort();
}
```
:::

## What is rejected (diagnostic M008)

The compiler emits diagnostic [M008](../api/diagnostics.md#m008) and halts code generation when it encounters a pattern it cannot analyze statically:

### Computed property access

```tsx
@effect
badEffect(): void {
  const key = this.props.fieldName;
  console.log(this[key]); // Error: M008 — dynamic this access
}
```

Fix: access the field directly.

### Iterating over this

```tsx
@effect
badEffect(): void {
  for (const key in this) { // Error: M008
    console.log(key, (this as any)[key]);
  }
}
```

Fix: use an explicit array or object for the data you want to iterate.

### Object.keys(this)

```tsx
@effect
badEffect(): void {
  const fields = Object.keys(this); // Error: M008
}
```

Fix: maintain an explicit array of the values you care about.

### Private field reads

```tsx
#privateValue = 'secret';

@effect
badEffect(): void {
  console.log(this.#privateValue); // Error: M008
}
```

Fix: use a `@state` or `@ref` field instead of a private field.

## Multiple effects

A component can have any number of `@effect` and `@effect.layout` methods. Each becomes an independent hook call in the generated output. They are emitted in source order.

```tsx
@effect
subscribeToEvents(): () => void {
  const off = emitter.on('event', this.handleEvent);
  return () => off();
}

@effect
async syncData(): Promise<void> {
  const data = await api.get(this.props.resourceId);
  this.data = data;
}

@effect.layout
measureContainer(): void {
  this.height = this.containerEl.current?.offsetHeight ?? 0;
}
```

Generated output (effects are independent):

```tsx
useEffect(() => {
  const off = emitter.on('event', handleEvent);
  return () => off();
}, [handleEvent]);

useEffect(() => {
  (async () => {
    const data = await api.get(props.resourceId);
    setData(data);
  })();
}, [props.resourceId]);

useLayoutEffect(() => {
  setHeight(containerEl.current?.offsetHeight ?? 0);
}, []);
```

## Related

- [`@effect` API reference](../api/effect.md)
- [Diagnostics reference](../api/diagnostics.md)
- [Components guide](./components.md)
