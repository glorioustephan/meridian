import { parseModule } from './parser/index.js';
import { lowerComponent } from './transform/component.js';
import { lowerPrimitive } from './transform/primitive.js';
import type { MeridianModuleIR, MeridianDiagnostic } from './ir.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompileResult {
  /** Generated React TSX source code. Undefined when there are errors. */
  output?: string;
  /** The intermediate representation produced by parsing. */
  ir: MeridianModuleIR;
  /** All diagnostics (errors and warnings) emitted during compilation. */
  diagnostics: MeridianDiagnostic[];
}

// ---------------------------------------------------------------------------
// compileModule
// ---------------------------------------------------------------------------

/**
 * Compile a Meridian source module to React TSX.
 *
 * Performs parsing, semantic validation, and code generation in a single
 * pipeline. If any error-severity diagnostics are present after parsing,
 * code generation is skipped and `output` is undefined.
 *
 * @param source   The raw Meridian source text.
 * @param filePath A path string used for diagnostic messages (does not need
 *                 to refer to a real file on disk).
 * @returns        A `CompileResult` containing the generated code (when
 *                 successful), the IR, and any diagnostics.
 *
 * @example
 * ```ts
 * const result = compileModule(sourceText, 'Counter.meridian.tsx');
 * if (!result.output) {
 *   console.error(result.diagnostics);
 * } else {
 *   await fs.writeFile('Counter.generated.tsx', result.output);
 * }
 * ```
 */
export function compileModule(source: string, filePath: string): CompileResult {
  const ir = parseModule(source, filePath);
  const errors = ir.diagnostics.filter((d) => d.severity === 'error');

  if (errors.length > 0) {
    return { ir, diagnostics: ir.diagnostics };
  }

  // Generate output for each declaration
  const parts: string[] = [];

  // Add 'use client' directive
  parts.push("'use client';");
  parts.push('');

  for (const decl of ir.declarations) {
    if (decl.kind === 'component') {
      parts.push(lowerComponent({ declaration: decl, imports: ir.imports, filePath }));
    } else if (decl.kind === 'primitive') {
      parts.push(lowerPrimitive({ declaration: decl, imports: ir.imports, filePath }));
    }
  }

  return {
    output: parts.join('\n'),
    ir,
    diagnostics: ir.diagnostics,
  };
}
