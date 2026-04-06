---
title: Components
---

# Components

`Component<Props>` is the base class for interactive client components. A class that extends `Component<Props>` compiles to a React function component. The class is authoring syntax — it does not exist at runtime.

## Anatomy of a Meridian component

Every Meridian component file follows this structure:

```tsx
'use client';  // Required — marks the module as a client entrypoint

import { Component, state, ref, effect } from '@meridian/meridian';

interface MyProps {
  // Your prop types here
}

export class MyComponent extends Component<MyProps> {
  // @state fields, @ref fields, @use fields
  // getters
  // methods
  // @effect methods

  render() {
    return <div>{/* JSX */}</div>;
  }
}
```

The four requirements:

1. `'use client'` must be the first statement in the file.
2. The class must extend `Component<Props>`.
3. The class must have a `render()` method that returns `React.ReactNode`.
4. The file must be processed by the Meridian compiler before it is consumed by your bundler.

:::warning
Importing a Meridian source file directly into your application without compiling it first will throw a runtime error: `"Meridian source must be compiled before execution."` Always run `meridian build` or `meridian watch` before your bundler.
:::

## Props

Props are declared as a type parameter to `Component<Props>`. Inside the class, props are accessed as `this.props`:

```tsx
'use client';

import { Component } from '@meridian/meridian';

interface GreetingProps {
  name: string;
  formal?: boolean;
}

export class Greeting extends Component<GreetingProps> {
  render() {
    const greeting = this.props.formal ? 'Good day' : 'Hello';
    return <p>{greeting}, {this.props.name}!</p>;
  }
}
```

`this.props` is typed as `Readonly<Props>`. You cannot assign to `this.props` or any of its properties — doing so is a TypeScript type error.

Props without a type parameter default to `{}`:

```tsx
export class SimpleBox extends Component {
  render() {
    return <div className="box" />;
  }
}
```

## State with @state

`@state` declares a reactive field. The field's initial value expression is evaluated once when the component mounts. Reading the field returns the current state value. Assigning to the field calls the corresponding setter.

### Basic state

```tsx
'use client';

import { Component, state } from '@meridian/meridian';

export class Toggle extends Component {
  @state open = false;

  toggle(): void {
    this.open = !this.open;
  }

  render() {
    return (
      <div>
        <button onClick={this.toggle}>{this.open ? 'Close' : 'Open'}</button>
        {this.open && <div className="panel">Content</div>}
      </div>
    );
  }
}
```

Generated output for the `@state open` field and `toggle` method:

```tsx
const [open, setOpen] = useState(() => false);

function toggle() {
  setOpen(!open);
}
```

### Initial value from props

State fields can be initialized from `this.props`:

```tsx
@state count = this.props.initialCount ?? 0;
@state name = this.props.defaultName ?? '';
```

The initial value expression is captured once at component mount. Subsequent prop changes do not reset the state — that is standard React behavior for `useState`.

### State mutation

Assign directly to the field to update state:

```tsx
this.count = this.count + 1;   // → setCount(count + 1)
this.name = 'Alice';           // → setName('Alice')
```

:::warning
Do not mutate state inside getters. Getters are pure derived expressions — they must not have side effects. The compiler rejects mutation inside a getter with a build error.
:::

### Supported state types

Any TypeScript type is valid as a state field type:

```tsx
@state items: string[] = [];
@state user: User | null = null;
@state position = { x: 0, y: 0 };
```

For object and array state, mutation still goes through the setter — you must produce a new value, not mutate in place:

```tsx
// Correct: produce a new array
addItem(item: string): void {
  this.items = [...this.items, item];
}

// Wrong: mutates in place, React will not re-render
addItemWrong(item: string): void {
  this.items.push(item); // Do not do this
}
```

## Refs with @ref

`@ref` declares a React ref object. Refs do not trigger re-renders when they change. They are suitable for holding DOM element references and mutable values that are not part of the render output.

```tsx
'use client';

import { Component, ref } from '@meridian/meridian';

export class FocusOnMount extends Component {
  @ref inputEl!: React.RefObject<HTMLInputElement>;

  @effect
  focusOnMount(): void {
    this.inputEl.current?.focus();
  }

  render() {
    return <input ref={this.inputEl} type="text" />;
  }
}
```

The `!` non-null assertion after the field name is required because `@ref` fields are assigned by the compiler, not by a class initializer. The type annotation `: React.RefObject<HTMLInputElement>` is optional but recommended for type safety on `ref.current`.

Generated output:

```tsx
const inputEl = useRef<HTMLInputElement>(null);
```

Accessing `this.inputEl.current` in methods and effects generates `inputEl.current`.

## Derived values with getters

Getters are compiled to plain `const` expressions. They receive no special memoization — that is left to the React Compiler.

```tsx
@state items: string[] = [];
@state filter = '';

get filteredItems(): string[] {
  return this.items.filter(item =>
    item.toLowerCase().includes(this.filter.toLowerCase())
  );
}

get count(): number {
  return this.filteredItems.length;
}
```

Generated output:

```tsx
const filteredItems = items.filter(item =>
  item.toLowerCase().includes(filter.toLowerCase())
);
const count = filteredItems.length;
```

Getters can reference other getters. The compiler resolves the dependency graph and emits them in the correct order. Circular getter dependencies are a build error.

### Getter restrictions

- Getters must be pure — no side effects, no async, no state mutation.
- Getters cannot read `#private` fields.
- Getters cannot use computed property access (`this[key]`).

## Methods as event handlers

Plain methods become local `function` declarations in the generated output. No `useCallback` is needed. The React Compiler will add memoization where appropriate.

```tsx
handleSubmit(e: React.FormEvent): void {
  e.preventDefault();
  this.submit();
}

async submit(): Promise<void> {
  this.loading = true;
  try {
    await api.post('/data', { value: this.value });
    this.success = true;
  } finally {
    this.loading = false;
  }
}
```

Generated output:

```tsx
function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  submit();
}

async function submit() {
  setLoading(true);
  try {
    await api.post('/data', { value });
    setSuccess(true);
  } finally {
    setLoading(false);
  }
}
```

Async methods are fully supported. Method calls to other methods in the same class (`this.submit()`) are rewritten to local function calls (`submit()`).

## The render method

`render()` must return `React.ReactNode`. Inside `render()`:

- `this.stateField` → the local state variable (`count`, not `this.count`)
- `this.props.x` → `props.x`
- `this.getter` → the local derived expression (`filteredItems`, not `this.filteredItems`)
- `this.method` → the local function reference (`handleSubmit`, not `this.handleSubmit`)
- `this.refField` → the ref object (`inputEl`, not `this.inputEl`)

```tsx
render() {
  return (
    <form onSubmit={this.handleSubmit}>
      <input
        ref={this.inputEl}
        value={this.value}
        onChange={e => { this.value = e.target.value; }}
        disabled={this.loading}
      />
      <button type="submit" disabled={this.loading || !this.value}>
        {this.loading ? 'Saving…' : 'Save'}
      </button>
      {this.success && <p>Saved!</p>}
    </form>
  );
}
```

Inline event handlers in JSX (`e => { this.value = e.target.value; }`) are supported. Inline `this.stateField = x` assignments inside arrow functions in render are rewritten to setter calls.

## A complete example

```tsx
'use client';

import { Component, state, ref, effect } from '@meridian/meridian';

interface TodoListProps {
  title: string;
}

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export class TodoList extends Component<TodoListProps> {
  @state todos: Todo[] = [];
  @state draft = '';
  @state nextId = 1;

  @ref inputEl!: React.RefObject<HTMLInputElement>;

  get remaining(): number {
    return this.todos.filter(t => !t.done).length;
  }

  get completedCount(): number {
    return this.todos.length - this.remaining;
  }

  handleDraftChange(e: React.ChangeEvent<HTMLInputElement>): void {
    this.draft = e.target.value;
  }

  addTodo(): void {
    if (!this.draft.trim()) return;
    this.todos = [
      ...this.todos,
      { id: this.nextId, text: this.draft.trim(), done: false },
    ];
    this.nextId = this.nextId + 1;
    this.draft = '';
    this.inputEl.current?.focus();
  }

  toggleTodo(id: number): void {
    this.todos = this.todos.map(t =>
      t.id === id ? { ...t, done: !t.done } : t
    );
  }

  handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') this.addTodo();
  }

  @effect
  persistTodos(): void {
    localStorage.setItem('todos', JSON.stringify(this.todos));
  }

  render() {
    return (
      <div>
        <h2>{this.props.title}</h2>
        <p>{this.remaining} remaining, {this.completedCount} done</p>
        <div>
          <input
            ref={this.inputEl}
            value={this.draft}
            onChange={this.handleDraftChange}
            onKeyDown={this.handleKeyDown}
            placeholder="New todo..."
          />
          <button onClick={this.addTodo}>Add</button>
        </div>
        <ul>
          {this.todos.map(todo => (
            <li
              key={todo.id}
              style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
              onClick={() => this.toggleTodo(todo.id)}
            >
              {todo.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }
}
```

## Lowering reference table

| Meridian syntax | Generated React output |
|---|---|
| `@state foo = init` | `const [foo, setFoo] = useState(() => init)` |
| `@ref el` | `const el = useRef(null)` |
| `this.stateField` (read) | `stateField` |
| `this.stateField = val` | `setStateField(val)` |
| `this.props.x` | `props.x` |
| `get derived()` | `const derived = ...` |
| `method()` | `function method() { ... }` |
| `@effect method()` | `useEffect(() => { ... }, [inferredDeps])` |
| `@effect.layout method()` | `useLayoutEffect(() => { ... }, [inferredDeps])` |
| `@use(P, () => [...])` | `const field = useP(...)` |
| `this.method` (in JSX) | `method` |
| `this.refField.current` | `refField.current` |

## Related

- [`@state` API reference](../api/state.md)
- [`@ref` API reference](../api/ref.md)
- [`@effect` API reference](../api/effect.md)
- [Primitives guide](./primitives.md) — reusable stateful logic
- [Effects guide](./effects.md) — dependency inference in depth
