---
title: Installation
---

# Installation

This guide covers adding Meridian to an existing TypeScript project. For a walkthrough that builds a complete component from scratch, see the [Quick Start](./quick-start.md).

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18 or later |
| TypeScript | 5.x |
| React | 19 |
| pnpm | 8 or later (npm and yarn also work) |

Meridian targets **standard decorators** as defined in TypeScript 5.x and the TC39 `2023-11` decorators proposal. This is distinct from TypeScript's legacy `experimentalDecorators` mode. The two are not compatible — make sure your project is not using legacy decorators before proceeding.

## Install packages

Install the author-facing package as a production dependency and the compiler and CLI as development dependencies:

```bash
pnpm add @meridian/meridian
pnpm add -D @meridian/compiler @meridian/cli
```

With npm:

```bash
npm install @meridian/meridian
npm install --save-dev @meridian/compiler @meridian/cli
```

With yarn:

```bash
yarn add @meridian/meridian
yarn add --dev @meridian/compiler @meridian/cli
```

## Configure TypeScript

Update your `tsconfig.json` to use standard decorators. The critical settings are `"experimentalDecorators": false` and `"useDefineForClassFields": true`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "experimentalDecorators": false,
    "useDefineForClassFields": true,
    "skipLibCheck": true
  }
}
```

:::warning
Do not set `"experimentalDecorators": true`. Meridian uses TypeScript 5.x standard decorators. Setting `experimentalDecorators` to `true` switches to the legacy decorator model, which is incompatible with Meridian's decorator API.
:::

:::tip
If your project currently uses `experimentalDecorators: true` for another library (such as TypeORM or class-validator), you will need to migrate those decorators before adopting Meridian, or keep Meridian files in a separate TypeScript project that does not enable legacy decorators.
:::

## Add package.json scripts

Meridian must run before your bundler. Add `predev` and `prebuild` scripts that run `meridian build`:

```json
{
  "scripts": {
    "predev": "meridian build",
    "dev": "next dev",
    "prebuild": "meridian build",
    "build": "next build"
  }
}
```

npm and pnpm both run `pre*` lifecycle scripts automatically before the matching script. When you run `pnpm dev`, `meridian build` runs first, generating the React output in `.meridian/generated/`, and then `next dev` starts.

For watch mode, use `meridian watch` in a separate terminal or with a concurrent script runner:

```json
{
  "scripts": {
    "predev": "meridian build",
    "dev": "next dev",
    "dev:meridian": "meridian watch"
  }
}
```

## Configure Meridian (optional)

By default, Meridian reads from `src/` and writes to `.meridian/generated/`. If your project uses different directories, create a `meridian.config.ts` at the project root:

```ts
// meridian.config.ts
export default {
  inputDir: 'src',
  outDir: '.meridian/generated',
  extensions: ['ts', 'tsx'],
};
```

| Option | Type | Default | Description |
|---|---|---|---|
| `inputDir` | `string` | `'src'` | Directory to scan for Meridian source files. |
| `outDir` | `string` | `'.meridian/generated'` | Directory where generated React TSX files are written. |
| `extensions` | `string[]` | `['ts', 'tsx']` | File extensions to process. |

## Add path aliases (Next.js)

When you import Meridian-compiled components in your application, you import them from the generated output directory, not the source directory. A path alias keeps import paths clean.

Add a `paths` entry to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@meridian/*": ["./.meridian/generated/*"]
    }
  }
}
```

With this alias, a generated component at `.meridian/generated/components/Counter.tsx` can be imported as:

```ts
import { Counter } from '@meridian/components/Counter';
```

If you already have a `@/*` alias pointing to `src/`, you can use a separate prefix to avoid conflicts:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@meridian/*": ["./.meridian/generated/*"]
    }
  }
}
```

## Add .gitignore entry

The `.meridian/generated/` directory is a build artifact. Add it to `.gitignore`:

```
.meridian/
```

Generated files are deterministically reproducible from source, so there is no value in committing them. The `predev` and `prebuild` scripts ensure they are always present before the bundler runs.

## Verify the installation

Create a minimal Meridian source file to confirm the toolchain is working:

```tsx
// src/components/Hello.tsx
'use client';

import { Component, state } from '@meridian/meridian';

export class Hello extends Component<{ name: string }> {
  @state clicked = false;

  handleClick(): void {
    this.clicked = true;
  }

  render() {
    return (
      <button onClick={this.handleClick}>
        {this.clicked ? `Hello, ${this.props.name}!` : 'Click me'}
      </button>
    );
  }
}
```

Run the compiler:

```bash
pnpm meridian build
```

You should see a generated file at `.meridian/generated/components/Hello.tsx`. If the compiler reports any errors, check that your `tsconfig.json` has `experimentalDecorators` set to `false` and that the `'use client'` directive is present at the top of the source file.

## Next steps

- [Quick Start](./quick-start.md) — build a complete counter component end to end.
- [Components](./components.md) — the full guide to `Component<Props>`.
- [CLI Reference](../api/cli.md) — all `meridian` CLI flags and options.
