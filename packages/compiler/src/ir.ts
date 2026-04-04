import type * as t from '@babel/types';

export type MeridianBaseKind = 'component' | 'primitive';

export interface SourceLocationIR {
  line: number;
  column: number;
}

export interface NamedImportBindingIR {
  imported: string;
  local: string;
}

export interface ImportIR {
  moduleSpecifier: string;
  defaultBinding?: string;
  namedBindings: NamedImportBindingIR[];
  sideEffectOnly?: boolean;
}

export interface ConstructorParamIR {
  name: string;
  optional: boolean;
  type?: string;
  node: t.Function['params'][number];
}

export interface MethodParamIR {
  name: string;
  optional: boolean;
  type?: string;
  node: t.Function['params'][number];
}

export interface UseTargetIR {
  primitiveName: string;
  argsFactory: t.Expression;
  importSource?: string;
}

export interface DependencyRef {
  source: 'state' | 'prop' | 'getter' | 'local';
  name: string;
}

export interface FieldIR {
  name: string;
  kind: 'state' | 'ref' | 'use' | 'plain';
  initializer?: t.Expression;
  initializerText?: string;
  typeAnnotation?: string;
  useTarget?: UseTargetIR;
  location: SourceLocationIR;
  isPrivate: boolean;
  decoratorNames: string[];
}

export interface GetterIR {
  name: string;
  body: t.BlockStatement;
  bodyText: string;
  dependencies: DependencyRef[];
  returnType?: string;
  location: SourceLocationIR;
}

export interface MethodIR {
  name: string;
  kind: 'effect' | 'layoutEffect' | 'method';
  params: MethodParamIR[];
  body: t.BlockStatement;
  bodyText: string;
  async: boolean;
  dependencies: DependencyRef[];
  returnType?: string;
  location: SourceLocationIR;
  decoratorNames: string[];
}

export interface RenderIR {
  body: t.BlockStatement;
  bodyText: string;
  location: SourceLocationIR;
}

export interface ResolveIR {
  body: t.BlockStatement;
  bodyText: string;
  returnType?: string;
  location: SourceLocationIR;
}

export interface ConstructorIR {
  params: ConstructorParamIR[];
  body: t.BlockStatement;
  bodyText: string;
  location: SourceLocationIR;
}

export interface MeridianDeclarationIR {
  name: string;
  kind: MeridianBaseKind;
  exportDefault: boolean;
  propsType?: string;
  superClassName?: string;
  fields: FieldIR[];
  getters: GetterIR[];
  methods: MethodIR[];
  render?: RenderIR;
  resolve?: ResolveIR;
  ctor?: ConstructorIR;
  location: SourceLocationIR;
  decoratorNames: string[];
}

export interface LocalClassIR {
  name: string;
  superClassName?: string;
  location: SourceLocationIR;
}

export type DiagnosticCode =
  | 'M001'
  | 'M002'
  | 'M003'
  | 'M004'
  | 'M005'
  | 'M006'
  | 'M007'
  | 'M008'
  | 'M009'
  | 'M010'
  | 'M011'
  | 'M012';

export interface MeridianDiagnostic {
  code: DiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
}

export interface MeridianModuleIR {
  sourceFile: string;
  clientDirective: boolean;
  imports: ImportIR[];
  declarations: MeridianDeclarationIR[];
  localClasses: LocalClassIR[];
  diagnostics: MeridianDiagnostic[];
  ast: t.File;
}
