export type {
  ConstructorIR,
  ConstructorParamIR,
  DependencyRef,
  DiagnosticCode,
  FieldIR,
  GetterIR,
  ImportIR,
  LocalClassIR,
  MeridianBaseKind,
  MeridianDeclarationIR,
  MeridianDiagnostic,
  MeridianModuleIR,
  MethodIR,
  MethodParamIR,
  NamedImportBindingIR,
  RenderIR,
  ResolveIR,
  SourceLocationIR,
  UseTargetIR,
} from './ir.js';
export { DIAGNOSTIC_MESSAGES, makeDiagnostic } from './diagnostics.js';
export { createModuleIR, parseModule } from './parser/index.js';
export { validateModule } from './validate.js';
export { compileModule } from './compile.js';
export type { CompileResult } from './compile.js';
export { lowerComponent } from './transform/component.js';
export type { ComponentCodegenOptions } from './transform/component.js';
export { lowerPrimitive } from './transform/primitive.js';
export type { PrimitiveCodegenOptions } from './transform/primitive.js';
export { analyzeDeps, flattenDeps } from './analyze/index.js';
export type {
  AnalyzedDeps,
  ClassContext,
  DependencySource,
  FlattenedDeps,
  ResolvedDep,
} from './analyze/deps.js';
