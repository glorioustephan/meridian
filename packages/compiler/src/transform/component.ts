import * as t from '@babel/types';
import { generateCode } from '../ast.js';
import type {
  FieldIR,
  GetterIR,
  ImportIR,
  MeridianDeclarationIR,
  MethodIR,
  NamedImportBindingIR,
} from '../ir.js';
import { type ClassContext } from '../analyze/index.js';
import { lowerEffect } from './effects.js';
import {
  rewriteBlockStatement,
  rewriteExpression,
  toSetterName,
  type RewriteContext,
} from './rewrite.js';

export interface ComponentCodegenOptions {
  declaration: MeridianDeclarationIR;
  imports: ImportIR[];
  filePath: string;
}

const MERIDIAN_SPECIFIERS = new Set(['meridian']);

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

function blockInner(blockCode: string): string {
  const trimmed = blockCode.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return trimmed;
  }
  return trimmed.slice(1, -1).trim();
}

function emitParamSource(param: MethodIR['params'][number]): string {
  let node = param.node;
  if (t.isTSParameterProperty(node)) {
    node = node.parameter;
  }

  if (t.isIdentifier(node)) {
    return `${node.name}${param.optional ? '?' : ''}${param.type ? `: ${param.type}` : ''}`;
  }

  if (t.isAssignmentPattern(node) && t.isIdentifier(node.left)) {
    return `${node.left.name}${param.optional ? '?' : ''}${param.type ? `: ${param.type}` : ''} = ${generateCode(node.right)}`;
  }

  if (t.isRestElement(node) && t.isIdentifier(node.argument)) {
    return `...${node.argument.name}${param.type ? `: ${param.type}` : ''}`;
  }

  return generateCode(node);
}

function paramsSource(params: MethodIR['params']): string {
  return params.map((param) => emitParamSource(param)).join(', ');
}

function primitiveHookName(primitiveName: string): string {
  if (/^Use[A-Z]/.test(primitiveName)) {
    return `use${primitiveName.slice(3)}`;
  }
  if (/^use[A-Z]/.test(primitiveName)) {
    return primitiveName;
  }
  return `use${primitiveName}`;
}

function buildPropsParam(propsType: string | undefined): string {
  return propsType ? `props: ${propsType}` : 'props: Record<string, unknown>';
}

function buildClassContext(declaration: MeridianDeclarationIR): ClassContext {
  return {
    stateFields: new Set(
      declaration.fields.filter((field) => field.kind === 'state').map((field) => field.name),
    ),
    getterNames: new Set(declaration.getters.map((getter) => getter.name)),
    getterBodies: new Map(declaration.getters.map((getter) => [getter.name, getter.body])),
    localFields: new Set<string>(),
  };
}

function buildRewriteContext(declaration: MeridianDeclarationIR): RewriteContext {
  const stateFields = declaration.fields.filter((field) => field.kind === 'state');
  const refFields = declaration.fields.filter((field) => field.kind === 'ref');
  const useFields = declaration.fields.filter((field) => field.kind === 'use');

  return {
    stateFields: new Set(stateFields.map((field) => field.name)),
    stateSetters: new Map(
      stateFields.map((field) => [field.name, toSetterName(field.name)]),
    ),
    refFields: new Set(refFields.map((field) => field.name)),
    getterNames: new Set(declaration.getters.map((getter) => getter.name)),
    methodNames: new Set(declaration.methods.map((method) => method.name)),
    localNames: new Set(useFields.map((field) => field.name)),
  };
}

function buildImportSource(
  importIR: ImportIR,
): string | undefined {
  const parts: string[] = [];
  if (importIR.defaultBinding) {
    parts.push(importIR.defaultBinding);
  }
  if (importIR.namedBindings.length > 0) {
    parts.push(
      `{ ${importIR.namedBindings
        .map((binding) =>
          binding.imported === binding.local
            ? binding.imported
            : `${binding.imported} as ${binding.local}`,
        )
        .join(', ')} }`,
    );
  }

  if (parts.length === 0) {
    return importIR.sideEffectOnly ? `import '${importIR.moduleSpecifier}';` : undefined;
  }

  return `import ${parts.join(', ')} from '${importIR.moduleSpecifier}';`;
}

function buildImportLines(imports: ImportIR[], declaration: MeridianDeclarationIR): string[] {
  const reactHooks = new Set<string>();
  if (declaration.fields.some((field) => field.kind === 'state')) {
    reactHooks.add('useState');
  }
  if (declaration.fields.some((field) => field.kind === 'ref')) {
    reactHooks.add('useRef');
  }
  if (declaration.methods.some((method) => method.kind === 'effect')) {
    reactHooks.add('useEffect');
  }
  if (declaration.methods.some((method) => method.kind === 'layoutEffect')) {
    reactHooks.add('useLayoutEffect');
  }

  const lines = [
    `import React${reactHooks.size > 0 ? `, { ${[...reactHooks].join(', ')} }` : ''} from 'react';`,
  ];

  const useTargets = declaration.fields
    .filter((field) => field.kind === 'use' && field.useTarget?.importSource)
    .map((field) => field.useTarget!)
    .map((target) => ({
      primitiveName: target.primitiveName,
      hookName: primitiveHookName(target.primitiveName),
      importSource: target.importSource!,
    }));

  const hookImports = new Map<string, Set<string>>();
  for (const target of useTargets) {
    if (!hookImports.has(target.importSource)) {
      hookImports.set(target.importSource, new Set());
    }
    hookImports.get(target.importSource)?.add(target.hookName);
  }

  for (const currentImport of imports) {
    if (MERIDIAN_SPECIFIERS.has(currentImport.moduleSpecifier)) {
      continue;
    }

    if (currentImport.moduleSpecifier === 'react') {
      continue;
    }

    const filtered: ImportIR = {
      ...currentImport,
      namedBindings: [...currentImport.namedBindings],
    };

    const useImportTargets = useTargets.filter(
      (target) => target.importSource === currentImport.moduleSpecifier,
    );

    if (useImportTargets.length > 0) {
      filtered.namedBindings = filtered.namedBindings.filter(
        (binding) => !useImportTargets.some((target) => binding.local === target.primitiveName),
      );
    }

    const line = buildImportSource(filtered);
    if (line) {
      lines.push(line);
    }
  }

  for (const [moduleSpecifier, hookNames] of hookImports.entries()) {
    lines.push(`import { ${[...hookNames].join(', ')} } from '${moduleSpecifier}';`);
  }

  return lines;
}

function lowerStateField(field: FieldIR, ctx: RewriteContext): string {
  const setter = toSetterName(field.name);

  if (!field.initializer) {
    return `  const [${field.name}, ${setter}] = useState<unknown>(undefined);`;
  }

  const initializer = generateCode(rewriteExpression(field.initializer, ctx));
  return `  const [${field.name}, ${setter}] = useState(() => ${initializer});`;
}

function lowerRefField(field: FieldIR): string {
  const typeArg = field.typeAnnotation ? `${field.typeAnnotation} | null` : 'unknown';
  return `  const ${field.name} = useRef<${typeArg}>(null);`;
}

function getArgsArrayExpression(argsFactory: t.Expression): t.ArrayExpression {
  if (t.isArrowFunctionExpression(argsFactory) && t.isArrayExpression(argsFactory.body)) {
    return argsFactory.body;
  }

  if (
    t.isArrowFunctionExpression(argsFactory) &&
    t.isBlockStatement(argsFactory.body) &&
    argsFactory.body.body.length === 1 &&
    t.isReturnStatement(argsFactory.body.body[0]) &&
    argsFactory.body.body[0].argument &&
    t.isArrayExpression(argsFactory.body.body[0].argument)
  ) {
    return argsFactory.body.body[0].argument;
  }

  return t.arrayExpression([]);
}

function lowerUseField(field: FieldIR, ctx: RewriteContext): string {
  if (!field.useTarget) {
    return `  const ${field.name} = undefined;`;
  }

  const hookName = primitiveHookName(field.useTarget.primitiveName);
  const argsArray = getArgsArrayExpression(field.useTarget.argsFactory);
  const args = argsArray.elements
    .map((element) => {
      if (!element || t.isSpreadElement(element)) {
        return undefined;
      }
      return generateCode(rewriteExpression(element, ctx));
    })
    .filter((current): current is string => Boolean(current));

  return `  const ${field.name} = ${hookName}(${args.join(', ')});`;
}

function lowerGetter(getter: GetterIR, ctx: RewriteContext): string {
  const rewritten = rewriteBlockStatement(getter.body, ctx);
  return `  const ${getter.name} = (() => ${generateCode(rewritten)})();`;
}

function lowerMethod(method: MethodIR, ctx: RewriteContext): string {
  const rewritten = rewriteBlockStatement(method.body, ctx);
  const params = paramsSource(method.params);
  const returnType = method.returnType ? `: ${method.returnType}` : '';
  const asyncKeyword = method.async ? 'async ' : '';
  return `  ${asyncKeyword}function ${method.name}(${params})${returnType} ${generateCode(rewritten)}`;
}

function lowerRender(render: MeridianDeclarationIR['render'], ctx: RewriteContext): string {
  if (!render) {
    return '  return null;';
  }

  const rewritten = rewriteBlockStatement(render.body, ctx);
  const inner = blockInner(generateCode(rewritten));
  return inner ? indent(inner, '  ') : '  return null;';
}

export function lowerComponent(options: ComponentCodegenOptions): string {
  const { declaration } = options;
  if (declaration.kind !== 'component') {
    throw new Error(`lowerComponent expected a component declaration, received ${declaration.kind}`);
  }

  const rewriteContext = buildRewriteContext(declaration);
  const classContext = buildClassContext(declaration);
  const stateFields = declaration.fields.filter((field) => field.kind === 'state');
  const refFields = declaration.fields.filter((field) => field.kind === 'ref');
  const useFields = declaration.fields.filter((field) => field.kind === 'use');
  const plainMethods = declaration.methods.filter((method) => method.kind === 'method');
  const effectMethods = declaration.methods.filter((method) => method.kind !== 'method');

  const bodyLines: string[] = [];

  if (stateFields.length > 0) {
    bodyLines.push('  // state');
    bodyLines.push(...stateFields.map((field) => lowerStateField(field, rewriteContext)));
    bodyLines.push('');
  }

  if (refFields.length > 0) {
    bodyLines.push('  // refs');
    bodyLines.push(...refFields.map(lowerRefField));
    bodyLines.push('');
  }

  if (useFields.length > 0) {
    bodyLines.push('  // primitives');
    bodyLines.push(...useFields.map((field) => lowerUseField(field, rewriteContext)));
    bodyLines.push('');
  }

  if (declaration.getters.length > 0) {
    bodyLines.push('  // derived values');
    bodyLines.push(...declaration.getters.map((getter) => lowerGetter(getter, rewriteContext)));
    bodyLines.push('');
  }

  if (plainMethods.length > 0) {
    bodyLines.push('  // methods');
    bodyLines.push(...plainMethods.map((method) => lowerMethod(method, rewriteContext)));
    bodyLines.push('');
  }

  if (effectMethods.length > 0) {
    bodyLines.push('  // effects');
    bodyLines.push(
      ...effectMethods.map((method) => lowerEffect(method, rewriteContext, classContext)),
    );
    bodyLines.push('');
  }

  bodyLines.push('  // render');
  bodyLines.push(lowerRender(declaration.render, rewriteContext));

  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
    bodyLines.pop();
  }

  return [
    `'use client';`,
    '',
    ...buildImportLines(options.imports, declaration),
    '',
    `${declaration.exportDefault ? 'export default function' : 'export function'} ${declaration.name}(${buildPropsParam(declaration.propsType)}) {`,
    ...bodyLines,
    '}',
    '',
  ].join('\n');
}
