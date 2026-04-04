import { createModuleIR } from './parser/index.js';
import { lowerComponent } from './transform/component.js';
import { lowerPrimitive } from './transform/primitive.js';
import { validateModule } from './validate.js';
import type { MeridianDiagnostic, MeridianModuleIR } from './ir.js';

export interface CompileResult {
  output?: string;
  ir: MeridianModuleIR;
  diagnostics: MeridianDiagnostic[];
}

export function compileModule(source: string, filePath: string): CompileResult {
  const ir = createModuleIR(source, filePath);
  const diagnostics = validateModule(ir);
  ir.diagnostics = diagnostics;

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ir, diagnostics };
  }

  const declaration = ir.declarations[0];
  if (!declaration) {
    return { ir, diagnostics };
  }

  const output =
    declaration.kind === 'component'
      ? lowerComponent({ declaration, imports: ir.imports, filePath })
      : lowerPrimitive({ declaration, imports: ir.imports, filePath });

  return {
    output,
    ir,
    diagnostics,
  };
}
