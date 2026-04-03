export type MeridianBaseKind = 'component' | 'primitive';

export interface MeridianModuleIR {
  sourceFile: string;
  clientDirective: boolean;
  imports: ImportIR[];
  declarations: MeridianDeclarationIR[];
  diagnostics: MeridianDiagnostic[];
}

export interface ImportIR {
  moduleSpecifier: string;
  namedBindings: string[];
  defaultBinding?: string;
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

export interface RenderIR {
  body: string;
  location: SourceLocationIR;
}

export interface ResolveIR {
  body: string;
  returnType?: string;
  location: SourceLocationIR;
}

export interface ConstructorIR {
  params: ConstructorParamIR[];
  body: string;
  location: SourceLocationIR;
}

export interface ConstructorParamIR {
  name: string;
  type?: string;
  optional: boolean;
}

export interface UseTargetIR {
  primitiveName: string;
  argsFactoryBody: string;
}

export interface DependencyRef {
  source: 'state' | 'prop' | 'getter';
  name: string;
}

export interface SourceLocationIR {
  line: number;
  column: number;
}

export type DiagnosticCode =
  | 'M001'
  | 'M002'
  | 'M003'
  | 'M004'
  | 'M005'
  | 'M006'
  | 'M007'
  | 'M008';

export interface MeridianDiagnostic {
  code: DiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
}
