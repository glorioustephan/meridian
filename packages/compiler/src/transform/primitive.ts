import * as t from '@babel/types';
import { generateCode, isSuperCallStatement } from '../ast.js';
import type {
  ConstructorParamIR,
  FieldIR,
  GetterIR,
  ImportIR,
  MeridianDeclarationIR,
  MethodIR,
} from '../ir.js';
import { type ClassContext } from '../analyze/index.js';
import { lowerEffect } from './effects.js';
import {
  rewriteBlockStatement,
  rewriteExpression,
  toSetterName,
  type RewriteContext,
} from './rewrite.js';

export interface PrimitiveCodegenOptions {
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

function emitParamSource(param: ConstructorParamIR | MethodIR['params'][number]): string {
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

function paramsSource(params: ConstructorParamIR[] | MethodIR['params']): string {
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

function buildImportLines(imports: ImportIR[], declaration: MeridianDeclarationIR): string[] {
  const hooks = new Set<string>();
  if (declaration.fields.some((field) => field.kind === 'state')) {
    hooks.add('useState');
  }
  if (declaration.fields.some((field) => field.kind === 'ref')) {
    hooks.add('useRef');
  }
  if (declaration.methods.some((method) => method.kind === 'effect')) {
    hooks.add('useEffect');
  }
  if (declaration.methods.some((method) => method.kind === 'layoutEffect')) {
    hooks.add('useLayoutEffect');
  }

  const lines = [
    `import React${hooks.size > 0 ? `, { ${[...hooks].join(', ')} }` : ''} from 'react';`,
  ];

  for (const currentImport of imports) {
    if (MERIDIAN_SPECIFIERS.has(currentImport.moduleSpecifier)) {
      continue;
    }
    if (currentImport.moduleSpecifier === 'react') {
      continue;
    }

    const parts: string[] = [];
    if (currentImport.defaultBinding) {
      parts.push(currentImport.defaultBinding);
    }
    if (currentImport.namedBindings.length > 0) {
      parts.push(
        `{ ${currentImport.namedBindings
          .map((binding) =>
            binding.imported === binding.local
              ? binding.imported
              : `${binding.imported} as ${binding.local}`,
          )
          .join(', ')} }`,
      );
    }

    if (parts.length === 0) {
      if (currentImport.sideEffectOnly) {
        lines.push(`import '${currentImport.moduleSpecifier}';`);
      }
      continue;
    }

    lines.push(`import ${parts.join(', ')} from '${currentImport.moduleSpecifier}';`);
  }

  return lines;
}

function buildRewriteContext(declaration: MeridianDeclarationIR): RewriteContext {
  const stateFields = declaration.fields.filter((field) => field.kind === 'state');
  const refFields = declaration.fields.filter((field) => field.kind === 'ref');
  const ctorParamNames = new Set((declaration.ctor?.params ?? []).map((param) => param.name));

  return {
    stateFields: new Set(stateFields.map((field) => field.name)),
    stateSetters: new Map(
      stateFields.map((field) => [field.name, toSetterName(field.name)]),
    ),
    refFields: new Set(refFields.map((field) => field.name)),
    getterNames: new Set(declaration.getters.map((getter) => getter.name)),
    methodNames: new Set(declaration.methods.map((method) => method.name)),
    localNames: ctorParamNames,
  };
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

function lowerConstructorStatements(
  declaration: MeridianDeclarationIR,
  ctx: RewriteContext,
): string[] {
  if (!declaration.ctor) {
    return [];
  }

  return declaration.ctor.body.body
    .filter((statement) => !isSuperCallStatement(statement))
    .map((statement) => indent(generateCode(rewriteBlockStatement(
      { ...declaration.ctor!.body, body: [statement] },
      ctx,
    )).replace(/^\{\s*|\s*\}$/g, ''), '  ').trimEnd())
    .filter((statement) => statement.length > 0);
}

function lowerResolve(resolve: MeridianDeclarationIR['resolve'], ctx: RewriteContext): string {
  if (!resolve) {
    return '  return undefined as never;';
  }

  const rewritten = rewriteBlockStatement(resolve.body, ctx);
  const inner = blockInner(generateCode(rewritten));
  return inner ? indent(inner, '  ') : '  return undefined as never;';
}

export function lowerPrimitive(options: PrimitiveCodegenOptions): string {
  const { declaration } = options;
  if (declaration.kind !== 'primitive') {
    throw new Error(`lowerPrimitive expected a primitive declaration, received ${declaration.kind}`);
  }

  const hookName = primitiveHookName(declaration.name);
  const rewriteContext = buildRewriteContext(declaration);
  const classContext = buildClassContext(declaration);
  const stateFields = declaration.fields.filter((field) => field.kind === 'state');
  const refFields = declaration.fields.filter((field) => field.kind === 'ref');
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

  const ctorStatements = lowerConstructorStatements(declaration, rewriteContext);
  if (ctorStatements.length > 0) {
    bodyLines.push('  // constructor');
    bodyLines.push(...ctorStatements);
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

  bodyLines.push('  // resolve');
  bodyLines.push(lowerResolve(declaration.resolve, rewriteContext));

  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
    bodyLines.pop();
  }

  const returnType = declaration.resolve?.returnType ? `: ${declaration.resolve.returnType}` : '';

  return [
    `'use client';`,
    '',
    ...buildImportLines(options.imports, declaration),
    '',
    `${declaration.exportDefault ? 'export default function' : 'export function'} ${hookName}(${paramsSource(declaration.ctor?.params ?? [])})${returnType} {`,
    ...bodyLines,
    '}',
    '',
  ].join('\n');
}
