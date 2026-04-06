---
title: CLI Reference
---

# CLI Reference

`@meridian/cli` provides the `meridian` command-line tool for compiling Meridian source files to React TSX.

## Install

```bash
pnpm add -D @meridian/cli
```

After installation, `meridian` is available in your project's `node_modules/.bin/` directory and can be run via `pnpm meridian`, `npx meridian`, or directly in `package.json` scripts.

## Commands

### meridian build

Compiles all Meridian source files once and exits.

```
meridian build [options]
```

**Options:**

| Flag | Alias | Type | Default | Description |
|---|---|---|---|---|
| `--cwd <dir>` | | `string` | `process.cwd()` | Working directory. Paths for `--input-dir` and `--out-dir` are resolved relative to this value. |
| `--input-dir <dir>` | | `string` | `src` | Directory to scan for Meridian source files. Scanned recursively. |
| `--out-dir <dir>` | | `string` | `.meridian/generated` | Directory where generated React TSX files are written. The relative path structure from `--input-dir` is preserved. |
| `--help` | `-h` | `boolean` | | Print help and exit. |

**Exit codes:**

| Code | Meaning |
|---|---|
| `0` | Compilation succeeded with no error-severity diagnostics. |
| `1` | One or more files produced error-severity diagnostics. Diagnostic details are printed to stderr. |

**Example:**

```bash
# Default: reads from src/, writes to .meridian/generated/
meridian build

# Custom directories
meridian build --input-dir app/meridian --out-dir .generated/react
```

---

### meridian watch

Watches for source file changes and recompiles affected files incrementally.

```
meridian watch [options]
```

**Options:**

| Flag | Alias | Type | Default | Description |
|---|---|---|---|---|
| `--cwd <dir>` | | `string` | `process.cwd()` | Working directory. |
| `--input-dir <dir>` | | `string` | `src` | Directory to watch. |
| `--out-dir <dir>` | | `string` | `.meridian/generated` | Output directory. |
| `--watch` | `-w` | `boolean` | | Equivalent to using `meridian watch`. Accepted on `meridian build` as a shorthand. |
| `--help` | `-h` | `boolean` | | Print help and exit. |

`meridian watch` does not exit on diagnostic errors. It prints diagnostics and continues watching so you can fix the source and see results immediately.

**Example:**

```bash
meridian watch

# Equivalent using --watch flag on build
meridian build --watch
```

---

## Using in package.json scripts

The standard workflow for Next.js projects:

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

For continuous recompilation during development, run `meridian watch` alongside the dev server. With a tool like `concurrently`:

```json
{
  "scripts": {
    "dev": "concurrently \"meridian watch\" \"next dev\""
  }
}
```

Or in separate terminals:

```bash
# Terminal 1
pnpm meridian watch

# Terminal 2
pnpm next dev
```

---

## meridian.config.ts

Place a `meridian.config.ts` file at the project root to configure default options. CLI flags override config file values.

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
| `inputDir` | `string` | `'src'` | Input directory. |
| `outDir` | `string` | `'.meridian/generated'` | Output directory. |
| `extensions` | `string[]` | `['ts', 'tsx']` | File extensions to process. |

---

## Output behavior

- Non-Meridian files (files that do not contain a class extending `Component` or `Primitive`) are copied to the output directory unchanged.
- Meridian source files are compiled. The generated file replaces the source file in the output directory. The filename is preserved.
- If a source file produces error-severity diagnostics, no output file is written for that file. Existing output from a previous successful build is left in place.

---

## CI integration

In CI, run `meridian build` and check the exit code. A non-zero exit indicates compilation errors:

```yaml
# GitHub Actions example
- name: Compile Meridian sources
  run: pnpm meridian build

- name: Build Next.js application
  run: pnpm next build
```

Because `predev` and `prebuild` run `meridian build` automatically, CI pipelines that call `pnpm build` will implicitly compile Meridian sources first.

---

## Related

- [Installation guide](../guide/installation.md)
- [Compiler API](./compiler.md) — for programmatic use
- [Diagnostics reference](./diagnostics.md)
