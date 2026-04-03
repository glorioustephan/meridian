export type {
  MeridianModuleIR,
  MeridianDeclarationIR,
  FieldIR,
  GetterIR,
  MethodIR,
  RenderIR,
  ResolveIR,
  ConstructorIR,
  ImportIR,
  DependencyRef,
  SourceLocationIR,
  MeridianDiagnostic,
  DiagnosticCode,
  MeridianBaseKind,
} from './ir.js';
export { makeDiagnostic, DIAGNOSTIC_MESSAGES } from './diagnostics.js';
export { parseModule } from './parser/index.js';
export { lowerComponent } from './transform/component.js';
export type { ComponentCodegenOptions } from './transform/component.js';
export { lowerPrimitive } from './transform/primitive.js';
export type { PrimitiveCodegenOptions } from './transform/primitive.js';
export { compileModule } from './compile.js';
export type { CompileResult } from './compile.js';
export { analyzeDeps, flattenDeps } from './analyze/index.js';
export type { ClassContext, ResolvedDep, AnalyzedDeps } from './analyze/index.js';
