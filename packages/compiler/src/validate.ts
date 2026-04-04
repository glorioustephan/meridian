import * as t from '@babel/types';
import { walkNode } from './ast.js';
import { analyzeDeps, flattenDeps, type ClassContext } from './analyze/index.js';
import { makeDiagnostic } from './diagnostics.js';
import type {
  FieldIR,
  MeridianDeclarationIR,
  MeridianDiagnostic,
  MeridianModuleIR,
  MethodIR,
} from './ir.js';

const SUPPORTED_FIELD_DECORATORS = new Set(['state', 'ref', 'use']);
const SUPPORTED_METHOD_DECORATORS = new Set(['effect', 'effect.layout']);

function isDynamicThisAccess(node: t.Node): boolean {
  let found = false;

  walkNode(node, (current) => {
    if (
      t.isMemberExpression(current) &&
      t.isThisExpression(current.object) &&
      current.computed
    ) {
      found = true;
      return;
    }

    if (t.isForInStatement(current) && t.isThisExpression(current.right)) {
      found = true;
      return;
    }

    if (
      t.isCallExpression(current) &&
      t.isMemberExpression(current.callee) &&
      t.isIdentifier(current.callee.object, { name: 'Object' }) &&
      t.isIdentifier(current.callee.property) &&
      current.arguments.length === 1 &&
      t.isThisExpression(current.arguments[0]) &&
      ['keys', 'values', 'entries'].includes(current.callee.property.name)
    ) {
      found = true;
    }
  });

  return found;
}

function isReactivePrivateUsage(node: t.Node): boolean {
  let found = false;

  walkNode(node, (current) => {
    if (
      t.isMemberExpression(current) &&
      t.isThisExpression(current.object) &&
      t.isPrivateName(current.property)
    ) {
      found = true;
    }
  });

  return found;
}

function stateMutationTargetName(
  node: t.LVal | t.Expression,
  stateFields: Set<string>,
): string | undefined {
  if (
    t.isMemberExpression(node) &&
    t.isThisExpression(node.object) &&
    !node.computed &&
    t.isIdentifier(node.property) &&
    stateFields.has(node.property.name)
  ) {
    return node.property.name;
  }

  return undefined;
}

function hasUnsupportedStateMutation(
  node: t.Node,
  stateFields: Set<string>,
  allowDirectAssignment: boolean,
): boolean {
  let found = false;

  walkNode(node, (current) => {
    if (t.isAssignmentExpression(current)) {
      const targetName = stateMutationTargetName(current.left, stateFields);
      if (!targetName) {
        return;
      }

      if (!allowDirectAssignment || current.operator !== '=') {
        found = true;
      }
      return;
    }

    if (t.isUpdateExpression(current)) {
      if (stateMutationTargetName(current.argument, stateFields)) {
        found = true;
      }
    }
  });

  return found;
}

function argsFactoryIsSupported(expression: t.Expression): boolean {
  if (!t.isArrowFunctionExpression(expression)) {
    return false;
  }

  const body = expression.body;
  if (t.isArrayExpression(body)) {
    return body.elements.every((element) => element !== null && !t.isSpreadElement(element));
  }

  if (
    t.isBlockStatement(body) &&
    body.body.length === 1 &&
    t.isReturnStatement(body.body[0]) &&
    body.body[0].argument &&
    t.isArrayExpression(body.body[0].argument)
  ) {
    return body.body[0].argument.elements.every(
      (element) => element !== null && !t.isSpreadElement(element),
    );
  }

  return false;
}

function validateFieldDecorators(
  moduleIR: MeridianModuleIR,
  declaration: MeridianDeclarationIR,
  field: FieldIR,
  diagnostics: MeridianDiagnostic[],
): void {
  for (const decoratorName of field.decoratorNames) {
    if (decoratorName === 'raw') {
      diagnostics.push(
        makeDiagnostic(
          'M005',
          'error',
          moduleIR.sourceFile,
          field.location.line,
          field.location.column,
        ),
      );
      continue;
    }

    if (!SUPPORTED_FIELD_DECORATORS.has(decoratorName)) {
      diagnostics.push(
        makeDiagnostic(
          'M003',
          'error',
          moduleIR.sourceFile,
          field.location.line,
          field.location.column,
          { name: decoratorName },
        ),
      );
    }
  }

  if (field.isPrivate && field.kind !== 'plain') {
    diagnostics.push(
      makeDiagnostic(
        'M010',
        'error',
        moduleIR.sourceFile,
        field.location.line,
        field.location.column,
      ),
    );
  }

  if (field.initializer && isDynamicThisAccess(field.initializer)) {
    diagnostics.push(
      makeDiagnostic(
        'M008',
        'error',
        moduleIR.sourceFile,
        field.location.line,
        field.location.column,
      ),
    );
  }

  if (field.initializer && isReactivePrivateUsage(field.initializer)) {
    diagnostics.push(
      makeDiagnostic(
        'M010',
        'error',
        moduleIR.sourceFile,
        field.location.line,
        field.location.column,
      ),
    );
  }

  if (field.kind === 'use') {
    const target = field.useTarget;
    const matchingImport = moduleIR.imports.find((entry) =>
      entry.namedBindings.some((binding) => binding.local === target?.primitiveName),
    );

    if (!target || !matchingImport || !argsFactoryIsSupported(target.argsFactory)) {
      diagnostics.push(
        makeDiagnostic(
          'M011',
          'error',
          moduleIR.sourceFile,
          field.location.line,
          field.location.column,
        ),
      );
      return;
    }

    target.importSource = matchingImport.moduleSpecifier;
  }

  const stateFieldNames = new Set(
    declaration.fields.filter((current) => current.kind === 'state').map((current) => current.name),
  );

  if (
    field.initializer &&
    hasUnsupportedStateMutation(field.initializer, stateFieldNames, false)
  ) {
    diagnostics.push(
      makeDiagnostic(
        'M012',
        'error',
        moduleIR.sourceFile,
        field.location.line,
        field.location.column,
      ),
    );
  }
}

function validateMethodDecorators(
  moduleIR: MeridianModuleIR,
  method: MethodIR,
  diagnostics: MeridianDiagnostic[],
): void {
  for (const decoratorName of method.decoratorNames) {
    if (decoratorName === 'raw') {
      diagnostics.push(
        makeDiagnostic(
          'M005',
          'error',
          moduleIR.sourceFile,
          method.location.line,
          method.location.column,
        ),
      );
      continue;
    }

    if (!SUPPORTED_METHOD_DECORATORS.has(decoratorName)) {
      diagnostics.push(
        makeDiagnostic(
          'M003',
          'error',
          moduleIR.sourceFile,
          method.location.line,
          method.location.column,
          { name: decoratorName },
        ),
      );
    }
  }
}

function validateReactiveBody(
  moduleIR: MeridianModuleIR,
  declaration: MeridianDeclarationIR,
  node: t.Node,
  location: { line: number; column: number },
  diagnostics: MeridianDiagnostic[],
  options: { allowDirectStateAssignment: boolean },
): void {
  const stateFieldNames = new Set(
    declaration.fields.filter((current) => current.kind === 'state').map((current) => current.name),
  );

  if (isDynamicThisAccess(node)) {
    diagnostics.push(
      makeDiagnostic('M008', 'error', moduleIR.sourceFile, location.line, location.column),
    );
  }

  if (isReactivePrivateUsage(node)) {
    diagnostics.push(
      makeDiagnostic('M010', 'error', moduleIR.sourceFile, location.line, location.column),
    );
  }

  if (
    hasUnsupportedStateMutation(node, stateFieldNames, options.allowDirectStateAssignment)
  ) {
    diagnostics.push(
      makeDiagnostic('M012', 'error', moduleIR.sourceFile, location.line, location.column),
    );
  }
}

function validateInheritance(
  moduleIR: MeridianModuleIR,
  declaration: MeridianDeclarationIR,
  diagnostics: MeridianDiagnostic[],
): void {
  if (
    declaration.name === 'ServerComponent' ||
    declaration.superClassName === 'ServerComponent'
  ) {
    diagnostics.push(
      makeDiagnostic(
        'M004',
        'error',
        moduleIR.sourceFile,
        declaration.location.line,
        declaration.location.column,
      ),
    );
  }

  if (!declaration.superClassName) {
    return;
  }

  if (
    declaration.superClassName !== 'Component' &&
    declaration.superClassName !== 'Primitive' &&
    declaration.superClassName !== 'ServerComponent'
  ) {
    const localMap = new Map(
      moduleIR.localClasses.map((current) => [current.name, current.superClassName]),
    );
    let current: string | undefined = declaration.superClassName;
    const seen = new Set<string>();

    while (current && !seen.has(current)) {
      if (current === 'Component' || current === 'Primitive' || current === 'ServerComponent') {
        diagnostics.push(
          makeDiagnostic(
            'M002',
            'error',
            moduleIR.sourceFile,
            declaration.location.line,
            declaration.location.column,
          ),
        );
        return;
      }

      seen.add(current);
      current = localMap.get(current);
    }
  }
}

function buildClassContext(declaration: MeridianDeclarationIR): ClassContext {
  return {
    stateFields: new Set(
      declaration.fields.filter((field) => field.kind === 'state').map((field) => field.name),
    ),
    getterNames: new Set(declaration.getters.map((getter) => getter.name)),
    getterBodies: new Map(declaration.getters.map((getter) => [getter.name, getter.body])),
    localFields: new Set((declaration.ctor?.params ?? []).map((param) => param.name)),
  };
}

export function validateModule(moduleIR: MeridianModuleIR): MeridianDiagnostic[] {
  const diagnostics: MeridianDiagnostic[] = [];

  if (moduleIR.declarations.length > 0 && !moduleIR.clientDirective) {
    diagnostics.push(makeDiagnostic('M001', 'error', moduleIR.sourceFile, 1, 0));
  }

  if (moduleIR.declarations.length > 1) {
    const second = moduleIR.declarations[1];
    diagnostics.push(
      makeDiagnostic(
        'M009',
        'error',
        moduleIR.sourceFile,
        second?.location.line ?? 1,
        second?.location.column ?? 0,
      ),
    );
  }

  for (const declaration of moduleIR.declarations) {
    validateInheritance(moduleIR, declaration, diagnostics);

    for (const decoratorName of declaration.decoratorNames) {
      diagnostics.push(
        makeDiagnostic(
          decoratorName === 'raw' ? 'M005' : 'M003',
          'error',
          moduleIR.sourceFile,
          declaration.location.line,
          declaration.location.column,
          decoratorName === 'raw' ? {} : { name: decoratorName },
        ),
      );
    }

    if (declaration.kind === 'component' && !declaration.render) {
      diagnostics.push(
        makeDiagnostic(
          'M006',
          'error',
          moduleIR.sourceFile,
          declaration.location.line,
          declaration.location.column,
        ),
      );
    }

    if (declaration.kind === 'primitive' && !declaration.resolve) {
      diagnostics.push(
        makeDiagnostic(
          'M007',
          'error',
          moduleIR.sourceFile,
          declaration.location.line,
          declaration.location.column,
        ),
      );
    }

    for (const field of declaration.fields) {
      validateFieldDecorators(moduleIR, declaration, field, diagnostics);
    }

    for (const method of declaration.methods) {
      validateMethodDecorators(moduleIR, method, diagnostics);
      validateReactiveBody(moduleIR, declaration, method.body, method.location, diagnostics, {
        allowDirectStateAssignment: true,
      });
    }

    for (const getter of declaration.getters) {
      validateReactiveBody(moduleIR, declaration, getter.body, getter.location, diagnostics, {
        allowDirectStateAssignment: false,
      });
    }

    if (declaration.render) {
      validateReactiveBody(
        moduleIR,
        declaration,
        declaration.render.body,
        declaration.render.location,
        diagnostics,
        { allowDirectStateAssignment: false },
      );
    }

    if (declaration.resolve) {
      validateReactiveBody(
        moduleIR,
        declaration,
        declaration.resolve.body,
        declaration.resolve.location,
        diagnostics,
        { allowDirectStateAssignment: false },
      );
    }

    if (declaration.ctor) {
      validateReactiveBody(
        moduleIR,
        declaration,
        declaration.ctor.body,
        declaration.ctor.location,
        diagnostics,
        { allowDirectStateAssignment: false },
      );
    }

    const classContext = buildClassContext(declaration);
    for (const getter of declaration.getters) {
      const analyzed = analyzeDeps(getter.body, classContext);
      const flattened = flattenDeps(analyzed.deps, classContext);
      if (analyzed.hasDynamicAccess) {
        diagnostics.push(
          makeDiagnostic(
            'M008',
            'error',
            moduleIR.sourceFile,
            getter.location.line,
            getter.location.column,
          ),
        );
      }
      if (analyzed.hasPrivateAccess) {
        diagnostics.push(
          makeDiagnostic(
            'M010',
            'error',
            moduleIR.sourceFile,
            getter.location.line,
            getter.location.column,
          ),
        );
      }
      getter.dependencies = flattened.deps;
    }

    for (const method of declaration.methods) {
      const analyzed = analyzeDeps(method.body, classContext);
      const flattened = flattenDeps(analyzed.deps, classContext);
      if (analyzed.hasDynamicAccess) {
        diagnostics.push(
          makeDiagnostic(
            'M008',
            'error',
            moduleIR.sourceFile,
            method.location.line,
            method.location.column,
          ),
        );
      }
      if (analyzed.hasPrivateAccess) {
        diagnostics.push(
          makeDiagnostic(
            'M010',
            'error',
            moduleIR.sourceFile,
            method.location.line,
            method.location.column,
          ),
        );
      }
      method.dependencies = flattened.deps;
    }
  }

  return diagnostics;
}
