import * as t from '@babel/types';
import { generateCode, parseTypeScriptModule, typeAnnotationText } from '../ast.js';
import type {
  ConstructorIR,
  ConstructorParamIR,
  FieldIR,
  GetterIR,
  ImportIR,
  LocalClassIR,
  MeridianDeclarationIR,
  MeridianModuleIR,
  MethodIR,
  MethodParamIR,
  NamedImportBindingIR,
  RenderIR,
  ResolveIR,
  SourceLocationIR,
  UseTargetIR,
} from '../ir.js';
import { validateModule } from '../validate.js';

interface RawClassRecord {
  name: string;
  superClassName?: string | undefined;
  exportDefault: boolean;
  node: t.ClassDeclaration;
}

function loc(node: t.Node): SourceLocationIR {
  return {
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
  };
}

function decoratorName(decorator: t.Decorator): string {
  const expr = decorator.expression;

  if (t.isIdentifier(expr)) {
    return expr.name;
  }

  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.object) &&
    t.isIdentifier(expr.property) &&
    !expr.computed
  ) {
    return `${expr.object.name}.${expr.property.name}`;
  }

  if (t.isCallExpression(expr)) {
    if (t.isIdentifier(expr.callee)) {
      return expr.callee.name;
    }

    if (
      t.isMemberExpression(expr.callee) &&
      t.isIdentifier(expr.callee.object) &&
      t.isIdentifier(expr.callee.property) &&
      !expr.callee.computed
    ) {
      return `${expr.callee.object.name}.${expr.callee.property.name}`;
    }
  }

  return generateCode(expr);
}

function superClassName(superClass: t.Expression | null | undefined): string | undefined {
  if (!superClass) {
    return undefined;
  }

  if (t.isIdentifier(superClass)) {
    return superClass.name;
  }

  return generateCode(superClass);
}

function extractPropsType(
  classNode: t.ClassDeclaration,
): string | undefined {
  const withTypeParams = classNode as t.ClassDeclaration & {
    superTypeParameters?: t.TSTypeParameterInstantiation;
  };

  const first = withTypeParams.superTypeParameters?.params[0];
  return first ? generateCode(first) : undefined;
}

function extractNamedImport(specifier: t.ImportSpecifier): NamedImportBindingIR {
  if (t.isIdentifier(specifier.imported)) {
    return { imported: specifier.imported.name, local: specifier.local.name };
  }

  return { imported: specifier.imported.value, local: specifier.local.name };
}

function extractFunctionParam(
  param: t.Function['params'][number],
): ConstructorParamIR | MethodParamIR {
  if (t.isIdentifier(param)) {
    const type = typeAnnotationText(param.typeAnnotation);
    return {
      name: param.name,
      optional: Boolean(param.optional),
      ...(type ? { type } : {}),
      node: param,
    };
  }

  if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
    const type = typeAnnotationText(param.left.typeAnnotation);
    return {
      name: param.left.name,
      optional: true,
      ...(type ? { type } : {}),
      node: param,
    };
  }

  if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
    return {
      name: param.argument.name,
      optional: false,
      node: param,
    };
  }

  if (t.isTSParameterProperty(param)) {
    if (t.isIdentifier(param.parameter)) {
      const type = typeAnnotationText(param.parameter.typeAnnotation);
      return {
        name: param.parameter.name,
        optional: Boolean(param.parameter.optional),
        ...(type ? { type } : {}),
        node: param,
      };
    }

    if (t.isAssignmentPattern(param.parameter) && t.isIdentifier(param.parameter.left)) {
      const type = typeAnnotationText(param.parameter.left.typeAnnotation);
      return {
        name: param.parameter.left.name,
        optional: true,
        ...(type ? { type } : {}),
        node: param,
      };
    }
  }

  return {
    name: generateCode(param),
    optional: false,
    node: param,
  };
}

function extractUseTarget(decorator: t.Decorator): UseTargetIR | undefined {
  if (!t.isCallExpression(decorator.expression)) {
    return undefined;
  }

  const [primitiveArg, argsFactory] = decorator.expression.arguments;
  if (!primitiveArg || !argsFactory || !t.isExpression(argsFactory)) {
    return undefined;
  }

  return {
    primitiveName: t.isIdentifier(primitiveArg)
      ? primitiveArg.name
      : generateCode(primitiveArg),
    argsFactory,
  };
}

function isMeridianCandidate(
  record: RawClassRecord,
  classMap: Map<string, RawClassRecord>,
): boolean {
  const seen = new Set<string>();
  let current: string | undefined = record.name;

  while (current) {
    if (current === 'Component' || current === 'Primitive' || current === 'ServerComponent') {
      return true;
    }

    if (seen.has(current)) {
      return false;
    }
    seen.add(current);

    const next: string | undefined = classMap.get(current)?.superClassName;
    current = next;
  }

  return false;
}

function extractField(
  member: t.ClassProperty | t.ClassPrivateProperty,
): FieldIR | undefined {
  const decorators = member.decorators ?? [];
  const decoratorNames = decorators.map(decoratorName);

  const keyName = t.isIdentifier(member.key)
    ? member.key.name
    : t.isPrivateName(member.key) && t.isIdentifier(member.key.id)
      ? member.key.id.name
      : undefined;

  if (!keyName) {
    return undefined;
  }

  let kind: FieldIR['kind'] = 'plain';
  let useTarget: UseTargetIR | undefined;

  if (decoratorNames.includes('state')) {
    kind = 'state';
  } else if (decoratorNames.includes('ref')) {
    kind = 'ref';
  } else if (decoratorNames.includes('use')) {
    kind = 'use';
    const useDecorator = decorators.find((current) => decoratorName(current) === 'use');
    if (useDecorator) {
      useTarget = extractUseTarget(useDecorator);
    }
  }

  const initializer =
    member.value && t.isExpression(member.value) ? member.value : undefined;
  const typeAnnotation = typeAnnotationText(member.typeAnnotation);

  return {
    name: keyName,
    kind,
    ...(initializer ? { initializer, initializerText: generateCode(initializer) } : {}),
    ...(typeAnnotation ? { typeAnnotation } : {}),
    ...(useTarget ? { useTarget } : {}),
    location: loc(member),
    isPrivate: t.isPrivateName(member.key),
    decoratorNames,
  };
}

function extractMethod(
  member: t.ClassMethod,
): {
  method?: MethodIR;
  getter?: GetterIR;
  render?: RenderIR;
  resolve?: ResolveIR;
  ctor?: ConstructorIR;
} {
  const decorators = member.decorators ?? [];
  const decoratorNames = decorators.map(decoratorName);
  const keyName = t.isIdentifier(member.key) ? member.key.name : undefined;

  if (member.kind === 'constructor') {
    return {
      ctor: {
        params: member.params.map(extractFunctionParam),
        body: member.body,
        bodyText: generateCode(member.body),
        location: loc(member),
      },
    };
  }

  if (!keyName) {
    return {};
  }

  if (member.kind === 'get') {
    const returnType = typeAnnotationText(member.returnType);
    return {
      getter: {
        name: keyName,
        body: member.body,
        bodyText: generateCode(member.body),
        dependencies: [],
        ...(returnType ? { returnType } : {}),
        location: loc(member),
      },
    };
  }

  if (member.kind === 'method' && keyName === 'render') {
    return {
      render: {
        body: member.body,
        bodyText: generateCode(member.body),
        location: loc(member),
      },
    };
  }

  if (member.kind === 'method' && keyName === 'resolve') {
    const returnType = typeAnnotationText(member.returnType);
    return {
      resolve: {
        body: member.body,
        bodyText: generateCode(member.body),
        ...(returnType ? { returnType } : {}),
        location: loc(member),
      },
    };
  }

  if (member.kind === 'method') {
    let kind: MethodIR['kind'] = 'method';
    const returnType = typeAnnotationText(member.returnType);
    if (decoratorNames.includes('effect.layout')) {
      kind = 'layoutEffect';
    } else if (decoratorNames.includes('effect')) {
      kind = 'effect';
    }

    return {
      method: {
        name: keyName,
        kind,
        params: member.params.map(extractFunctionParam),
        body: member.body,
        bodyText: generateCode(member.body),
        async: member.async,
        dependencies: [],
        ...(returnType ? { returnType } : {}),
        location: loc(member),
        decoratorNames,
      },
    };
  }

  return {};
}

export function createModuleIR(source: string, filePath: string): MeridianModuleIR {
  const ast = parseTypeScriptModule(source);
  const imports: ImportIR[] = [];
  const rawClasses: RawClassRecord[] = [];

  let clientDirective = false;
  if (ast.program.directives?.some((directive) => directive.value.value === 'use client')) {
    clientDirective = true;
  } else {
    const firstStatement = ast.program.body[0];
    clientDirective =
      Boolean(
        firstStatement &&
          t.isExpressionStatement(firstStatement) &&
          t.isStringLiteral(firstStatement.expression) &&
          firstStatement.expression.value === 'use client',
      );
  }

  for (const statement of ast.program.body) {
    if (t.isImportDeclaration(statement)) {
      const namedBindings: NamedImportBindingIR[] = [];
      let defaultBinding: string | undefined;
      let sideEffectOnly = statement.specifiers.length === 0;

      for (const specifier of statement.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          namedBindings.push(extractNamedImport(specifier));
          sideEffectOnly = false;
          continue;
        }

        if (t.isImportDefaultSpecifier(specifier)) {
          defaultBinding = specifier.local.name;
          sideEffectOnly = false;
        }
      }

      imports.push({
        moduleSpecifier: statement.source.value,
        ...(defaultBinding ? { defaultBinding } : {}),
        namedBindings,
        ...(sideEffectOnly ? { sideEffectOnly: true } : {}),
      });
      continue;
    }

    let classNode: t.ClassDeclaration | undefined;
    let exportDefault = false;

    if (t.isClassDeclaration(statement)) {
      classNode = statement;
    } else if (
      t.isExportDefaultDeclaration(statement) &&
      t.isClassDeclaration(statement.declaration)
    ) {
      classNode = statement.declaration;
      exportDefault = true;
    } else if (
      t.isExportNamedDeclaration(statement) &&
      statement.declaration &&
      t.isClassDeclaration(statement.declaration)
    ) {
      classNode = statement.declaration;
    }

    if (!classNode || !classNode.id) {
      continue;
    }

    const directSuperClassName = superClassName(classNode.superClass);
    rawClasses.push({
      name: classNode.id.name,
      ...(directSuperClassName ? { superClassName: directSuperClassName } : {}),
      exportDefault,
      node: classNode,
    });
  }

  const classMap = new Map(rawClasses.map((record) => [record.name, record]));
  const localClasses: LocalClassIR[] = rawClasses.map((record) => ({
    name: record.name,
    ...(record.superClassName ? { superClassName: record.superClassName } : {}),
    location: loc(record.node),
  }));

  const declarations: MeridianDeclarationIR[] = [];

  for (const record of rawClasses) {
    if (!isMeridianCandidate(record, classMap)) {
      continue;
    }

    const classDecoratorNames = (record.node.decorators ?? []).map(decoratorName);
    const fields: FieldIR[] = [];
    const getters: GetterIR[] = [];
    const methods: MethodIR[] = [];
    let render: RenderIR | undefined;
    let resolve: ResolveIR | undefined;
    let ctor: ConstructorIR | undefined;

    for (const member of record.node.body.body) {
      if (t.isClassProperty(member) || t.isClassPrivateProperty(member)) {
        const field = extractField(member);
        if (field) {
          fields.push(field);
        }
        continue;
      }

      if (!t.isClassMethod(member)) {
        continue;
      }

      const extracted = extractMethod(member);
      if (extracted.ctor) {
        ctor = extracted.ctor;
      }
      if (extracted.getter) {
        getters.push(extracted.getter);
      }
      if (extracted.method) {
        methods.push(extracted.method);
      }
      if (extracted.render) {
        render = extracted.render;
      }
      if (extracted.resolve) {
        resolve = extracted.resolve;
      }
    }

    const propsType = extractPropsType(record.node);
    declarations.push({
      name: record.name,
      kind:
        record.superClassName === 'Primitive'
          ? 'primitive'
          : record.superClassName === 'Component'
            ? 'component'
            : classMap.get(record.superClassName ?? '')?.superClassName === 'Primitive'
              ? 'primitive'
              : 'component',
      exportDefault: record.exportDefault,
      ...(propsType ? { propsType } : {}),
      ...(record.superClassName ? { superClassName: record.superClassName } : {}),
      fields,
      getters,
      methods,
      ...(render ? { render } : {}),
      ...(resolve ? { resolve } : {}),
      ...(ctor ? { ctor } : {}),
      location: loc(record.node),
      decoratorNames: classDecoratorNames,
    });
  }

  return {
    sourceFile: filePath,
    clientDirective,
    imports,
    declarations,
    localClasses,
    diagnostics: [],
    ast,
  };
}

export function parseModule(source: string, filePath: string): MeridianModuleIR {
  const moduleIR = createModuleIR(source, filePath);
  return {
    ...moduleIR,
    diagnostics: validateModule(moduleIR),
  };
}
