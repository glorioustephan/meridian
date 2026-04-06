---
title: Compiler API
---

# Compiler API

The `@meridian/compiler` package exposes a programmatic API for transforming Meridian source files. Use this when integrating Meridian into a custom build tool, editor plugin, or test harness. For most projects, the [`@meridian/cli`](./cli.md) is the right entry point.

## Install

```bash
pnpm add -D @meridian/compiler
```

## compileModule

Compiles a Meridian source file from a string and returns the generated React TSX, the intermediate representation, and any diagnostics.

```ts
import { compileModule } from '@meridian/compiler';

const result = compileModule(source, filePath);
```

### Signature

```ts
function compileModule(
  source: string,
  filePath: string,
): CompileResult;
```

| Parameter | Type | Description |
|---|---|---|
| `source` | `string` | The source code of the Meridian file as a string. |
| `filePath` | `string` | The absolute path to the source file. Used for diagnostic source locations and source map generation. |

### Return value: CompileResult

```ts
interface CompileResult {
  output: string | undefined;
  ir: MeridianModuleIR;
  diagnostics: MeridianDiagnostic[];
}
```

| Field | Type | Description |
|---|---|---|
| `output` | `string \| undefined` | The generated React TSX source code. `undefined` if compilation produced any error-severity diagnostics. |
| `ir` | `MeridianModuleIR` | The parsed intermediate representation of the module, regardless of whether code generation succeeded. |
| `diagnostics` | `MeridianDiagnostic[]` | All diagnostics produced during compilation. May include both errors and warnings. |

### Example

```ts
import { readFileSync } from 'fs';
import { compileModule } from '@meridian/compiler';

const filePath = '/path/to/src/components/Counter.tsx';
const source = readFileSync(filePath, 'utf-8');

const { output, ir, diagnostics } = compileModule(source, filePath);

if (diagnostics.some(d => d.severity === 'error')) {
  for (const diag of diagnostics) {
    console.error(`[${diag.code}] ${diag.file}:${diag.line}:${diag.column} — ${diag.message}`);
  }
  process.exit(1);
}

console.log(output); // Generated React TSX
```

## parseModule

Parses a Meridian source file into an IR without performing code generation. Useful for analysis, linting, or editor tooling.

```ts
import { parseModule } from '@meridian/compiler';

const ir = parseModule(source, filePath);
```

### Signature

```ts
function parseModule(
  source: string,
  filePath: string,
): MeridianModuleIR;
```

`parseModule` returns the IR even when the source contains errors. Diagnostics are embedded in the returned `MeridianModuleIR.diagnostics` array.

## MeridianModuleIR

The intermediate representation of a compiled Meridian module.

```ts
interface MeridianModuleIR {
  sourceFile: string;
  clientDirective: boolean;
  imports: ImportIR[];
  declarations: MeridianDeclarationIR[];
  diagnostics: MeridianDiagnostic[];
}
```

| Field | Type | Description |
|---|---|---|
| `sourceFile` | `string` | The absolute path passed to `compileModule` or `parseModule`. |
| `clientDirective` | `boolean` | Whether `'use client'` was found as the first statement. |
| `imports` | `ImportIR[]` | Import statements from the source file. |
| `declarations` | `MeridianDeclarationIR[]` | All Meridian class declarations found in the file. |
| `diagnostics` | `MeridianDiagnostic[]` | Diagnostics produced during parsing. |

### MeridianDeclarationIR

```ts
interface MeridianDeclarationIR {
  name: string;
  kind: 'component' | 'primitive';
  exportDefault: boolean;
  propsType?: string;
  fields: FieldIR[];
  getters: GetterIR[];
  methods: MethodIR[];
  render?: RenderIR;
  resolve?: ResolveIR;
  constructor?: ConstructorIR;
}
```

### FieldIR

```ts
interface FieldIR {
  name: string;
  kind: 'state' | 'ref' | 'use' | 'plain';
  initializer?: string;
  useTarget?: UseTargetIR;
  location: SourceLocationIR;
}
```

### MethodIR

```ts
interface MethodIR {
  name: string;
  kind: 'effect' | 'layoutEffect' | 'method';
  body: string;
  async: boolean;
  dependencies: DependencyRef[];
  location: SourceLocationIR;
}
```

### DependencyRef

```ts
interface DependencyRef {
  source: 'state' | 'prop' | 'getter';
  name: string;
}
```

## MeridianDiagnostic

```ts
interface MeridianDiagnostic {
  code: 'M001' | 'M002' | 'M003' | 'M004' | 'M005' | 'M006' | 'M007' | 'M008';
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
}
```

| Field | Type | Description |
|---|---|---|
| `code` | `string` | The diagnostic code. See the [Diagnostics reference](./diagnostics.md) for all codes and their meanings. |
| `severity` | `'error' \| 'warning'` | Error-severity diagnostics suppress code generation. Warning-severity diagnostics do not. |
| `message` | `string` | A human-readable description of the problem. |
| `file` | `string` | The file path where the diagnostic was generated. |
| `line` | `number` | The 1-based line number of the offending code. |
| `column` | `number` | The 1-based column number of the offending code. |

## When to use the compiler API vs the CLI

Use the **CLI** (`meridian build` / `meridian watch`) for:
- Standard Next.js and Vite project workflows
- `package.json` `predev` / `prebuild` scripts
- Watch mode during development

Use the **compiler API** directly for:
- Custom build tool integration (Rollup plugin, Webpack loader, esbuild plugin)
- Editor language server plugins that need live IR data
- Test harnesses that compile Meridian fixtures in-process
- Linting or static analysis tools that need the IR without code generation

## Integration example: custom Vite plugin

```ts
// vite-plugin-meridian.ts
import type { Plugin } from 'vite';
import { compileModule } from '@meridian/compiler';

export function meridianPlugin(): Plugin {
  return {
    name: 'meridian',
    transform(source, id) {
      if (!id.endsWith('.tsx') && !id.endsWith('.ts')) return null;

      const { output, diagnostics } = compileModule(source, id);

      for (const diag of diagnostics) {
        if (diag.severity === 'error') {
          this.error({
            message: `[${diag.code}] ${diag.message}`,
            loc: { file: diag.file, line: diag.line, column: diag.column },
          });
        } else {
          this.warn(`[${diag.code}] ${diag.message}`);
        }
      }

      return output ? { code: output, map: null } : null;
    },
  };
}
```

:::warning
The Vite plugin approach processes Meridian source at bundle time, not as a precompile step. This changes the workflow — generated files do not land on disk in `.meridian/generated/`. For Next.js projects, use the CLI precompile approach instead, since Next.js uses its own compiler and does not support arbitrary Vite-style transform plugins natively.
:::

## Related

- [CLI Reference](./cli.md)
- [Diagnostics reference](./diagnostics.md)
- [Installation guide](../guide/installation.md)
