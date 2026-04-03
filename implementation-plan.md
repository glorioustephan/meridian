# Meridian Implementation Plan

This document translates [rfc.md](./rfc.md) into a concrete, multi-phase plan to build Meridian v1.

All implementation is assumed to be in **TypeScript**, using ESM modules and strict type-checking throughout.

---

## 1. Goals

Meridian v1 should deliver the narrowed contract defined in the RFC:

- class-shaped authoring for client React components
- `Component<Props>` and `Primitive<T>` as the public model
- compile-time lowering only
- static dependency inference only
- explicit `'use client'` module boundaries
- compatibility with React 19 and Next.js App Router through generated standard React code

Meridian v1 should **not** attempt to ship:

- runtime Proxy tracking
- `ServerComponent`
- `Resource<T>`
- decorated inheritance
- class decorators
- `@context`, `@id`, `@transition`
- `@state.deferred`, `@state.optimistic`, `@state.external`, `@state.reducer`
- native SWC or Turbopack transforms

---

## 2. Repository Plan

Use a TypeScript monorepo from the start so the compiler, runtime API, and CLI can evolve independently.

```text
/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  tsconfig.json
  vitest.config.ts
  packages/
    meridian/
      src/
        index.ts
        component.ts
        primitive.ts
        decorators.ts
        errors.ts
        types.ts
    compiler/
      src/
        index.ts
        compile.ts
        diagnostics.ts
        ir.ts
        parser/
        analyze/
        transform/
        codegen/
    cli/
      src/
        index.ts
        build.ts
        watch.ts
        config.ts
  fixtures/
    basic-counter/
    primitive-debounce/
    invalid-dynamic-deps/
    invalid-private-reactive/
    invalid-inheritance/
    invalid-server-component/
    next-app-router/
```

### Core package roles

- `packages/meridian`: author-facing package with base classes, decorator factories, shared types, and runtime guards.
- `packages/compiler`: AST parser, analyzer, diagnostics, IR builder, and code generator.
- `packages/cli`: precompile command used before `next dev` / `next build`.

### Technical defaults

- package manager: `pnpm`
- module format: ESM
- TypeScript mode: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- test runner: `vitest`
- React rendering tests: `@testing-library/react`
- AST stack: `@babel/parser`, `@babel/traverse`, `@babel/types`, `@babel/generator`

The initial compiler should be a TypeScript package that consumes TS/TSX source and emits TSX. Do not start with a Babel plugin. Ship the compiler as a library first, then wrap it in the CLI.

---

## 3. Core TypeScript Contracts

These are the core types to stabilize early.

```ts
// packages/compiler/src/ir.ts
export type MeridianBaseKind = 'component' | 'primitive';

export interface MeridianModuleIR {
  sourceFile: string;
  clientDirective: boolean;
  imports: ImportIR[];
  declarations: MeridianDeclarationIR[];
  diagnostics: MeridianDiagnostic[];
}

export interface MeridianDeclarationIR {
  name: string;
  kind: MeridianBaseKind;
  exportDefault: boolean;
  propsType?: string;
  fields: FieldIR[];
  getters: GetterIR[];
  methods: MethodIR[];
  render?: RenderIR;
  resolve?: ResolveIR;
  constructor?: ConstructorIR;
}

export interface FieldIR {
  name: string;
  kind: 'state' | 'ref' | 'use' | 'plain';
  initializer?: string;
  useTarget?: UseTargetIR;
  location: SourceLocationIR;
}

export interface GetterIR {
  name: string;
  body: string;
  dependencies: DependencyRef[];
  location: SourceLocationIR;
}

export interface MethodIR {
  name: string;
  kind: 'effect' | 'layoutEffect' | 'method';
  body: string;
  async: boolean;
  dependencies: DependencyRef[];
  location: SourceLocationIR;
}

export interface UseTargetIR {
  primitiveName: string;
  argsFactoryBody: string;
}

export interface DependencyRef {
  source: 'state' | 'prop' | 'getter';
  name: string;
}

export interface MeridianDiagnostic {
  code:
    | 'M001'
    | 'M002'
    | 'M003'
    | 'M004'
    | 'M005'
    | 'M006'
    | 'M007'
    | 'M008';
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
}
```

```ts
// packages/meridian/src/types.ts
export abstract class Component<Props = {}> {
  declare readonly props: Readonly<Props>;
  abstract render(): React.ReactNode;
}

export abstract class Primitive<T> {
  abstract resolve(): T;
}

export interface StateDecorator {
  (value: undefined, context: ClassFieldDecoratorContext): void;
}

export interface RefDecorator {
  (value: undefined, context: ClassFieldDecoratorContext): void;
}

export interface EffectDecorator {
  (value: Function, context: ClassMethodDecoratorContext): void;
  layout: (value: Function, context: ClassMethodDecoratorContext) => void;
}

export interface UseDecoratorFactory {
  <TArgs extends unknown[]>(
    primitive: new (...args: TArgs) => Primitive<unknown>,
    argsFactory: () => TArgs,
  ): StateDecorator;
}
```

The runtime package should keep these implementations deliberately small. The compiler is the real feature.

---

## 4. Phase Plan

## Phase 0 - Workspace and Tooling Foundation

### Objective

Create the monorepo, TypeScript configuration, test harness, and package boundaries so subsequent phases only add behavior.

### Deliverables

- root workspace config
- base `tsconfig`
- package skeletons for `meridian`, `compiler`, and `cli`
- `vitest` setup for unit and fixture tests
- lint/format baseline
- fixture directory layout

### Key decisions

- use TypeScript project references for fast incremental builds
- keep emitted code as TS/TSX in early phases to simplify debugging
- adopt ESM everywhere; do not mix CJS in the CLI

### Exit criteria

- `pnpm install`
- `pnpm build` type-checks all packages
- `pnpm test` runs an empty test suite successfully

---

## Phase 1 - Public API Scaffold

### Objective

Ship the author-facing TypeScript surface with the exact v1 API, but without any real lowering yet.

### Scope

- `Component<Props>`
- `Primitive<T>`
- `@state`
- `@ref`
- `@effect`
- `@effect.layout`
- `@use`

### Implementation

- add strongly typed base classes in `packages/meridian`
- implement decorators as marker decorators
- if Meridian-authored files execute without compilation, throw a runtime guard error with a clear message:

```ts
throw new Error(
  'Meridian source must be compiled before execution. Run the Meridian compiler or CLI first.',
);
```

- export all public symbols from `packages/meridian/src/index.ts`

### Exit criteria

- TypeScript authoring examples from the RFC compile at the type level
- uncompiled execution fails loudly and predictably
- there is no accidental support for deferred APIs

---

## Phase 2 - AST Parsing and Semantic Validation

### Objective

Build the compiler front-end that finds Meridian classes, validates them against the RFC, and produces typed IR.

### Scope

- parse `.ts` and `.tsx`
- detect `'use client'`
- detect classes extending `Component` or `Primitive`
- collect decorators, fields, getters, methods, `render()`, `resolve()`, and constructor
- reject unsupported constructs before codegen

### Required diagnostics

- missing `'use client'` in a Meridian component module
- decorated inheritance
- unsupported decorator names
- `ServerComponent` usage
- `@raw` usage
- missing `render()` on `Component`
- missing `resolve()` on `Primitive`
- multiple Meridian declarations per default-export module if that complicates early codegen

### Exit criteria

- fixture tests build IR successfully for valid samples
- invalid fixtures produce exact diagnostic codes and source locations
- no code generation happens yet

---

## Phase 3 - Component Lowering

### Objective

Generate React function components from valid `Component<Props>` classes.

### Scope

- `@state`
- `@ref`
- pure getters
- plain methods
- `render()`

### Lowering rules

- `@state foo = expr` -> `const [foo, setFoo] = useState(() => expr)`
- `@ref el` -> `const el = useRef(...)`
- getter access -> inline local derived expression or helper function
- method access from JSX -> local lexical function
- `this.foo = next` where `foo` is state -> `setFoo(next)` or functional form when required
- `this.props.bar` -> `props.bar`

### Hard constraints

- method rewriting must be syntax-aware, not string replacement
- only support direct `this.stateField` assignment in v1
- reject mutation forms that are ambiguous to rewrite safely

### Exit criteria

- the counter example from the RFC lowers to valid React TSX
- generated code renders correctly in tests
- Strict Mode test proves state lives in hooks, not on a retained class instance

---

## Phase 4 - Effect Lowering and Static Dependency Inference

### Objective

Support `@effect` and `@effect.layout` with static dependency inference.

### Scope

- direct reads of `this.props.x`
- direct reads of `this.stateField`
- recursive getter dependencies
- cleanup function returns
- async effect methods, if they lower to an inner async function rather than async effect callbacks directly

### Analyzer rules

- build a dependency graph from getters and effect methods
- flatten getter dependencies into concrete state/prop reads
- reject unresolved dynamic access

### Rejections in v1

- `this[key]`
- `for (const k in this)`
- `Object.keys(this)`
- reading `#private` values in getters or effect methods
- circular getter dependency graphs

### Exit criteria

- valid effect fixtures produce stable dependency arrays
- invalid dynamic dependency fixtures fail with actionable diagnostics
- layout effects lower to `useLayoutEffect`

---

## Phase 5 - Primitive and `@use` Lowering

### Objective

Compile `Primitive<T>` classes into custom hooks and wire them into `Component` classes through `@use`.

### Scope

- constructor argument capture
- primitive-local `@state`, `@ref`, getters, and effects
- `resolve()` return value
- `@use(Primitive, argsFactory)` lowering in source order

### Implementation

- lower each primitive to a generated `function use<PrimitiveName>(...)`
- compile constructor parameters into hook parameters
- compile `resolve()` as the hook return value
- in a component, replace the `@use` field with a top-level call to the generated hook

### Constraints

- `argsFactory` must be statically analyzable
- primitive hook order must be deterministic
- primitives remain client-only in v1

### Exit criteria

- debounce-style primitive fixture works end to end
- primitive hook output is stable across re-renders
- generated component code keeps all hook calls at top level

---

## Phase 6 - CLI and Precompile Pipeline

### Objective

Ship a usable TypeScript CLI that turns Meridian source into generated React files before the app build runs.

### CLI commands

```ts
interface MeridianCliCommand {
  name: 'build' | 'watch';
  cwd?: string;
  inputDir?: string;
  outDir?: string;
  extensions?: Array<'ts' | 'tsx'>;
}
```

### Planned behavior

- `meridian build`
  - scans input files
  - compiles Meridian modules
  - writes generated TSX to an output directory
  - copies through non-Meridian files unchanged or via configurable passthrough
- `meridian watch`
  - incremental rebuild on file changes
  - stable diagnostics in watch mode

### Output strategy

- default generated directory: `.meridian/generated`
- preserve relative module paths under the output directory
- generate source maps in development mode

### Exit criteria

- a sample app can import generated output
- watch mode rebuilds a changed Meridian file correctly
- diagnostics fail the build on invalid source

---

## Phase 7 - Next.js App Router Fixture

### Objective

Prove the narrowed integration story against a real Next.js App Router app.

### Fixture requirements

- App Router project in `fixtures/next-app-router`
- a standard Server Component page imports a compiled Meridian client child
- the Meridian source file includes explicit `'use client'`
- the fixture build consumes generated TSX, not raw Meridian source

### Validation

- `next dev` works against generated output
- `next build` succeeds
- hydration works for the Meridian client child
- no claim of custom RSC support is required

### Exit criteria

- green end-to-end Next.js fixture
- documented developer workflow for precompile plus Next.js

---

## Phase 8 - React Compiler Validation and Stabilization

### Objective

Confirm Meridian output remains correct and compatible when React Compiler optimization is enabled.

### Scope

- build generated fixtures with React Compiler enabled
- verify correctness does not depend on `useMemo` or `useCallback` being emitted by Meridian
- measure whether any generated patterns should be adjusted for readability or compiler friendliness

### Exit criteria

- compiler-enabled builds pass
- no Meridian codegen rule depends on manual memoization by default
- v1 limitations are finalized in docs and diagnostics

---

## Phase 9 - v1 Hardening and Release Prep

### Objective

Turn the prototype into a shippable v1 alpha.

### Scope

- stable error codes and docs
- install docs and CLI docs
- publish configuration for all packages
- changelog and versioning policy
- additional regression fixtures

### Exit criteria

- alpha release candidate published
- example app and fixture docs are reproducible from a clean checkout
- unsupported features are explicitly documented, not implied

---

## 5. Test Matrix

Translate the RFC test plan into concrete automated coverage.

### Unit tests

- IR extraction for valid `Component` modules
- IR extraction for valid `Primitive` modules
- decorator recognition
- dependency graph resolution
- mutation rewrite for direct state assignment

### Negative fixture tests

- dynamic dependency inference
- decorated inheritance
- reactive `#private` usage
- `@raw`
- `ServerComponent`
- missing `'use client'`
- missing `render()`
- missing `resolve()`

### Generated output tests

- basic counter render
- effect cleanup behavior
- layout effect lowering
- primitive debounce behavior
- top-level hook ordering

### Integration tests

- CLI build
- CLI watch
- Next.js App Router fixture
- React Compiler-enabled build

---

## 6. Phase Gates

Use these rules to keep scope under control.

- Do not start `Resource<T>` before Phase 9 and a separate RFC.
- Do not start `ServerComponent` authoring before the Next.js fixture is stable and Meridian's client story is proven.
- Do not add runtime dependency tracking if static inference becomes painful; add explicit diagnostics first.
- Do not add decorator modifiers for advanced React hooks in v1.
- Do not start a native SWC transform before the TypeScript compiler package and CLI are stable.

---

## 7. First Build Order

If implementation starts immediately, the first sequence should be:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9

The first meaningful milestone is the end of **Phase 4**: a Meridian `Component` that compiles to React TSX with `@state`, getters, and `@effect`, plus failing diagnostics for unsupported patterns.

