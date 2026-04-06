---
title: Diagnostics
---

# Diagnostics

The Meridian compiler emits structured diagnostics when it encounters invalid or unsupported patterns. All error-severity diagnostics halt code generation for the affected file.

## Diagnostic codes

| Code | Severity | Summary |
|---|---|---|
| [M001](#m001) | error | Missing `'use client'` directive |
| [M002](#m002) | error | Decorated inheritance not supported |
| [M003](#m003) | error | Unsupported decorator name |
| [M004](#m004) | error | `ServerComponent` not supported in v1 |
| [M005](#m005) | error | `@raw` not supported in v1 |
| [M006](#m006) | error | `Component` missing `render()` method |
| [M007](#m007) | error | `Primitive` missing `resolve()` method |
| [M008](#m008) | error | Dynamic `this` access in effect or getter |

---

## M001

**Missing `'use client'` directive**

### Description

Every file that contains a Meridian `Component` class must have `'use client'` as its first statement. This marks the module as a Next.js App Router client entrypoint.

### Offending code

```tsx
// src/components/Counter.tsx — missing 'use client'
import { Component, state } from '@meridian/meridian';

export class Counter extends Component {
  @state count = 0;
  render() { return <button>{this.count}</button>; }
}
```

```
Error M001: Counter.tsx:1 — Meridian components must be in explicit client modules.
Add 'use client'; as the first line of this file.
```

### Fix

Add `'use client';` as the very first line:

```tsx
'use client';

import { Component, state } from '@meridian/meridian';

export class Counter extends Component {
  @state count = 0;
  render() { return <button>{this.count}</button>; }
}
```

:::tip
`Primitive<T>` files do not require `'use client'`. Only `Component` files that form module-level client entrypoints need the directive.
:::

---

## M002

**Decorated inheritance not supported**

### Description

A Meridian `Component` or `Primitive` may not extend another class that has decorated members (`@state`, `@ref`, `@effect`, etc.). Reactive behavior must live on the concrete class being compiled. Reusable logic belongs in `Primitive<T>`.

### Offending code

```tsx
'use client';

import { Component, state } from '@meridian/meridian';

class Base extends Component {
  @state sharedValue = 0; // Decorated member on a base class
}

export class Child extends Base { // Error: M002
  render() { return <div>{this.sharedValue}</div>; }
}
```

```
Error M002: Child.tsx:9 — Decorated inheritance is not supported in v1.
Move reactive behavior into a Primitive and compose it with @use.
```

### Fix

Extract the shared logic into a `Primitive<T>` and compose it with `@use`:

```tsx
'use client';

import { Component, Primitive, state, use } from '@meridian/meridian';

export class SharedLogic extends Primitive<number> {
  @state sharedValue = 0;
  resolve(): number { return this.sharedValue; }
}

export class MyComponent extends Component {
  @use(SharedLogic, () => [])
  sharedValue!: number;

  render() { return <div>{this.sharedValue}</div>; }
}
```

---

## M003

**Unsupported decorator name**

### Description

A decorator was applied to a class member that is not one of the supported Meridian decorators: `@state`, `@ref`, `@effect`, `@effect.layout`, `@use`.

### Offending code

```tsx
'use client';

import { Component } from '@meridian/meridian';

export class MyComponent extends Component {
  @memo // Error: M003
  expensiveMethod() { return computeSomething(); }

  render() { return <div>{this.expensiveMethod()}</div>; }
}
```

```
Error M003: MyComponent.tsx:6 — Unsupported decorator '@memo'.
Supported decorators are: @state, @ref, @effect, @effect.layout, @use.
```

### Fix

Remove the unsupported decorator. If you need memoization, the React Compiler handles that automatically for Meridian-generated output. Do not apply `@memo` or similar decorators manually.

---

## M004

**ServerComponent not supported in v1**

### Description

The `ServerComponent` base class is not available in Meridian v1. Server-side rendering logic belongs in standard Next.js Server Components (async function components).

### Offending code

```tsx
import { ServerComponent } from '@meridian/meridian'; // Error: M004

export class ProductList extends ServerComponent {
  // ...
}
```

```
Error M004: ProductList.tsx:1 — ServerComponent authoring is deferred in v1.
Use a standard Next.js async function component for server-side rendering.
```

### Fix

Replace with a standard Next.js async function component:

```tsx
// app/products/page.tsx (Server Component)
export default async function ProductList() {
  const products = await fetchProducts();
  return (
    <ul>
      {products.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

---

## M005

**@raw not supported in v1**

### Description

The `@raw` decorator is not available in Meridian v1. It is reserved for a future release.

### Offending code

```tsx
'use client';

import { Component, raw } from '@meridian/meridian';

export class MyComponent extends Component {
  @raw // Error: M005
  legacyField: any;

  render() { return <div />; }
}
```

```
Error M005: MyComponent.tsx:6 — @raw is not supported in v1.
```

### Fix

Remove the `@raw` decorator. Use `@state` for reactive fields or `@ref` for non-reactive mutable values.

---

## M006

**Component missing render() method**

### Description

A class extending `Component<Props>` must implement a `render()` method that returns `React.ReactNode`. Without `render()`, the compiler cannot generate a valid function component body.

### Offending code

```tsx
'use client';

import { Component, state } from '@meridian/meridian';

export class Counter extends Component { // Error: M006
  @state count = 0;
  increment() { this.count++; }
  // No render() method
}
```

```
Error M006: Counter.tsx:4 — Component 'Counter' is missing a render() method.
Add a render() method that returns React.ReactNode.
```

### Fix

Implement the `render()` method:

```tsx
'use client';

import { Component, state } from '@meridian/meridian';

export class Counter extends Component {
  @state count = 0;
  increment() { this.count++; }

  render() {
    return <button onClick={this.increment}>{this.count}</button>;
  }
}
```

---

## M007

**Primitive missing resolve() method**

### Description

A class extending `Primitive<T>` must implement a `resolve()` method that returns a value of type `T`. `resolve()` defines the hook's return value. Without it, the compiler cannot generate a valid custom hook.

### Offending code

```tsx
import { Primitive, state } from '@meridian/meridian';

export class UseCounter extends Primitive<number> { // Error: M007
  @state count = 0;
  increment() { this.count++; }
  // No resolve() method
}
```

```
Error M007: UseCounter.ts:3 — Primitive 'UseCounter' is missing a resolve() method.
Add a resolve() method that returns a value of type T.
```

### Fix

Implement the `resolve()` method:

```tsx
import { Primitive, state } from '@meridian/meridian';

export class UseCounter extends Primitive<number> {
  @state count = 0;
  increment() { this.count++; }

  resolve(): number {
    return this.count;
  }
}
```

---

## M008

**Dynamic `this` access in effect or getter**

### Description

The compiler cannot statically determine the dependency set for an effect or getter because the method body contains a dynamic access pattern: computed property access (`this[key]`), `for...in` iteration over `this`, or `Object.keys(this)`. Reads of `#private` fields also trigger M008 because they cannot be tracked statically.

### Offending patterns

**Computed property access:**

```tsx
@effect
bad(): void {
  const key = this.props.fieldName;
  console.log(this[key]); // Error: M008
}
```

**for...in iteration:**

```tsx
@effect
bad(): void {
  for (const k in this) { // Error: M008
    console.log(k);
  }
}
```

**Object.keys(this):**

```tsx
@effect
bad(): void {
  Object.keys(this).forEach(k => console.log(k)); // Error: M008
}
```

**Private field reads:**

```tsx
#secret = 'hidden';

@effect
bad(): void {
  console.log(this.#secret); // Error: M008
}
```

```
Error M008: MyComponent.tsx:12 — Dynamic this access is not supported in @effect.
Replace this[key] with a direct field access.
```

### Fix

Access fields directly by name:

```tsx
// Instead of this[dynamicKey], use a switch or explicit fields:
@effect
good(): void {
  if (this.props.fieldName === 'count') {
    console.log(this.count);
  } else if (this.props.fieldName === 'name') {
    console.log(this.name);
  }
}
```

For private fields, replace `#private` with a `@state` or `@ref` field:

```tsx
// Instead of #secret
@ref secret!: React.RefObject<string | null>;
```

---

## Reading diagnostics programmatically

When using the [Compiler API](./compiler.md), diagnostics are returned as an array of `MeridianDiagnostic` objects:

```ts
import { compileModule } from '@meridian/compiler';

const { diagnostics } = compileModule(source, filePath);

for (const diag of diagnostics) {
  console.log(`[${diag.severity.toUpperCase()}] ${diag.code}: ${diag.message}`);
  console.log(`  at ${diag.file}:${diag.line}:${diag.column}`);
}
```

## Related

- [Compiler API](./compiler.md)
- [CLI Reference](./cli.md)
- [Why Meridian](../guide/why-meridian.md) — design rationale for compile-time errors
