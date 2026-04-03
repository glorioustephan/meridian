import type {
  MeridianDeclarationIR,
  FieldIR,
  GetterIR,
  MethodIR,
  ImportIR,
  ConstructorParamIR,
} from '../ir.js';
import { rewriteBody, toSetterName, type RewriteContext } from './rewrite.js';
import { analyzeDeps, flattenDeps, type ClassContext } from '../analyze/index.js';
import { lowerEffect, indentBlock } from './effects.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PrimitiveCodegenOptions {
  declaration: MeridianDeclarationIR;
  imports: ImportIR[];
  /** Absolute or relative path to the source file (used for comments only) */
  filePath: string;
}

/**
 * Lower a `MeridianDeclarationIR` of kind='primitive' into a React custom hook
 * function suitable for writing to disk.
 *
 * A Primitive class like:
 *   export class Debounce extends Primitive<string> { ... }
 *
 * becomes:
 *   export function useDebounce(value: string, delay: number): string { ... }
 *
 * The hook name is derived by prepending 'use' to the class name.
 * Constructor parameters become hook function parameters.
 * @state fields lower to useState, @effect methods lower to useEffect, etc.
 * The resolve() return expression becomes the hook's return statement.
 */
export function lowerPrimitive(options: PrimitiveCodegenOptions): string {
  const { declaration: decl, imports } = options;

  if (decl.kind !== 'primitive') {
    throw new Error(
      `lowerPrimitive: expected kind='primitive', got '${decl.kind}'`,
    );
  }

  // -------------------------------------------------------------------------
  // Derive hook name
  // -------------------------------------------------------------------------
  const hookName = `use${decl.name}`;

  // -------------------------------------------------------------------------
  // Classify fields
  // -------------------------------------------------------------------------
  const stateFields: FieldIR[] = decl.fields.filter((f) => f.kind === 'state');
  const refFields: FieldIR[] = decl.fields.filter((f) => f.kind === 'ref');

  // -------------------------------------------------------------------------
  // Build rewrite context.
  //
  // Constructor params are treated as plain locals already in scope (function
  // parameters), so they are added to getterNames so that `this.paramName`
  // rewrites to `paramName` (the same transformation as for getter/method
  // references). They do NOT need setters since they are not reactive state.
  // -------------------------------------------------------------------------
  const ctorParams: ConstructorParamIR[] = decl.constructor?.params ?? [];
  const ctorParamNames = new Set(ctorParams.map((p) => p.name));

  const stateFieldSet = new Set(stateFields.map((f) => f.name));
  const stateSetterMap = new Map<string, string>(
    stateFields.map((f) => [f.name, toSetterName(f.name)]),
  );
  const refFieldSet = new Set(refFields.map((f) => f.name));
  const getterNameSet = new Set(decl.getters.map((g) => g.name));
  const methodNameSet = new Set(decl.methods.map((m) => m.name));
  // Include constructor param names in getterNames so this.paramName -> paramName
  const extendedGetterNames = new Set([...getterNameSet, ...ctorParamNames]);

  const ctx: RewriteContext = {
    stateFields: stateFieldSet,
    stateSetters: stateSetterMap,
    refFields: refFieldSet,
    getterNames: extendedGetterNames,
    methodNames: methodNameSet,
  };

  // -------------------------------------------------------------------------
  // Decide which React hooks are needed
  // -------------------------------------------------------------------------
  const effectMethods = decl.methods.filter((m) => m.kind !== 'method');
  const hasEffect = effectMethods.some((m) => m.kind === 'effect');
  const hasLayoutEffect = effectMethods.some((m) => m.kind === 'layoutEffect');

  const reactHooks: string[] = [];
  if (stateFields.length > 0) reactHooks.push('useState');
  if (refFields.length > 0) reactHooks.push('useRef');
  if (hasEffect) reactHooks.push('useEffect');
  if (hasLayoutEffect) reactHooks.push('useLayoutEffect');

  // -------------------------------------------------------------------------
  // Build import lines
  // -------------------------------------------------------------------------
  const importLines = buildImportLines(imports, reactHooks);

  // -------------------------------------------------------------------------
  // Build hook parameters from constructor params
  // -------------------------------------------------------------------------
  const hookParams = buildHookParams(ctorParams);

  // -------------------------------------------------------------------------
  // Build return type from resolve()
  // -------------------------------------------------------------------------
  const returnType = decl.resolve?.returnType ?? 'unknown';

  // -------------------------------------------------------------------------
  // Build function signature
  // -------------------------------------------------------------------------
  const exportKeyword = decl.exportDefault
    ? 'export default function'
    : 'export function';
  const signature = `${exportKeyword} ${hookName}(${hookParams}): ${returnType}`;

  // -------------------------------------------------------------------------
  // Build function body lines
  // -------------------------------------------------------------------------
  const bodyLines: string[] = [];

  // @state fields
  if (stateFields.length > 0) {
    bodyLines.push('  // state');
    for (const field of stateFields) {
      bodyLines.push(lowerStateField(field));
    }
    bodyLines.push('');
  }

  // @ref fields
  if (refFields.length > 0) {
    bodyLines.push('  // refs');
    for (const field of refFields) {
      bodyLines.push(lowerRefField(field));
    }
    bodyLines.push('');
  }

  // Constructor body statements (non-param-property statements)
  const ctorBodyStatements = extractCtorBodyStatements(decl.constructor?.body);
  if (ctorBodyStatements.length > 0) {
    bodyLines.push('  // constructor body');
    for (const stmt of ctorBodyStatements) {
      bodyLines.push(`  ${stmt}`);
    }
    bodyLines.push('');
  }

  // Derived values (getters)
  if (decl.getters.length > 0) {
    bodyLines.push('  // derived values');
    for (const getter of decl.getters) {
      bodyLines.push(lowerGetter(getter, ctx));
    }
    bodyLines.push('');
  }

  // Build ClassContext for dep analysis
  const classCtx: ClassContext = {
    stateFields: stateFieldSet,
    propNames: new Set<string>(),
    getterNames: getterNameSet,
    getterBodies: new Map(
      decl.getters.map((g) => [g.name, g.body]),
    ),
  };

  // Plain methods
  const plainMethods = decl.methods.filter((m) => m.kind === 'method');

  if (plainMethods.length > 0) {
    bodyLines.push('  // methods');
    for (const method of plainMethods) {
      bodyLines.push(lowerMethod(method, ctx));
      bodyLines.push('');
    }
  }

  // Effect methods
  if (effectMethods.length > 0) {
    bodyLines.push('  // effects');
    for (const method of effectMethods) {
      bodyLines.push(lowerEffect(method, ctx, classCtx));
      bodyLines.push('');
    }
  }

  // resolve() return expression
  if (decl.resolve) {
    bodyLines.push('  // resolve');
    bodyLines.push(lowerResolve(decl.resolve.body, ctx));
  }

  // Trim trailing blank lines from body
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
    bodyLines.pop();
  }

  // -------------------------------------------------------------------------
  // Assemble the output
  // -------------------------------------------------------------------------
  const parts: string[] = [
    `'use client';`,
    '',
    ...importLines,
    '',
    `${signature} {`,
    ...bodyLines,
    `}`,
    '',
  ];

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Import generation
// ---------------------------------------------------------------------------

const MERIDIAN_SPECIFIERS = new Set([
  '@meridian/meridian',
  'meridian',
]);

function buildImportLines(imports: ImportIR[], reactHooks: string[]): string[] {
  const lines: string[] = [];

  const hooksPart =
    reactHooks.length > 0 ? `, { ${reactHooks.join(', ')} }` : '';
  lines.push(`import React${hooksPart} from 'react';`);

  for (const imp of imports) {
    if (MERIDIAN_SPECIFIERS.has(imp.moduleSpecifier)) continue;
    if (imp.moduleSpecifier === 'react') continue;
    lines.push(buildImportLine(imp));
  }

  return lines;
}

function buildImportLine(imp: ImportIR): string {
  const parts: string[] = [];

  if (imp.defaultBinding !== undefined) {
    parts.push(imp.defaultBinding);
  }

  if (imp.namedBindings.length > 0) {
    parts.push(`{ ${imp.namedBindings.join(', ')} }`);
  }

  if (parts.length === 0) {
    return `import '${imp.moduleSpecifier}';`;
  }

  return `import ${parts.join(', ')} from '${imp.moduleSpecifier}';`;
}

// ---------------------------------------------------------------------------
// Hook parameter generation
// ---------------------------------------------------------------------------

function buildHookParams(params: ConstructorParamIR[]): string {
  return params
    .map((p) => {
      const typeStr = p.type ?? 'unknown';
      const optMark = p.optional ? '?' : '';
      return `${p.name}${optMark}: ${typeStr}`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Constructor body extraction
// ---------------------------------------------------------------------------

/**
 * Extract non-trivial statements from the constructor body text.
 *
 * The constructor body from the parser includes the block braces and typically
 * contains a `super()` call plus any initialization statements. We strip:
 *   - The outer braces
 *   - `super(...)` calls (they have no meaning in a hook context)
 *   - Empty lines
 *
 * The remaining statements are returned as an array of trimmed strings, ready
 * to be emitted inside the hook body.
 */
function extractCtorBodyStatements(bodyCode: string | undefined): string[] {
  if (!bodyCode) return [];

  const trimmed = bodyCode.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  // Split on newlines, trim each line, filter empties and super() calls
  return inner
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isSuperCall(line));
}

/** True if the line is a bare super() call statement. */
function isSuperCall(line: string): boolean {
  return /^super\s*\(.*\)\s*;?\s*$/.test(line.trim());
}

// ---------------------------------------------------------------------------
// Field lowering
// ---------------------------------------------------------------------------

function lowerStateField(field: FieldIR): string {
  const setter = toSetterName(field.name);

  if (field.initializer !== undefined) {
    return `  const [${field.name}, ${setter}] = useState(() => ${field.initializer});`;
  }

  return `  const [${field.name}, ${setter}] = useState<unknown>(undefined);`;
}

function lowerRefField(field: FieldIR): string {
  return `  const ${field.name} = useRef<unknown>(null);`;
}

// ---------------------------------------------------------------------------
// Getter lowering
// ---------------------------------------------------------------------------

function lowerGetter(getter: GetterIR, ctx: RewriteContext): string {
  const rewrittenBody = rewriteBody(getter.body, ctx);
  return `  const ${getter.name} = (() => ${rewrittenBody})();`;
}

// ---------------------------------------------------------------------------
// Method lowering
// ---------------------------------------------------------------------------

function lowerMethod(method: MethodIR, ctx: RewriteContext): string {
  const rewrittenBody = rewriteBody(method.body, ctx);
  const asyncKeyword = method.async ? 'async ' : '';
  return `  ${asyncKeyword}function ${method.name}(...args: unknown[]) ${rewrittenBody}`;
}

// ---------------------------------------------------------------------------
// Resolve lowering
// ---------------------------------------------------------------------------

/**
 * Lower the resolve() body into a return statement.
 *
 * The resolve body is a block statement like `{ return this.debouncedValue; }`.
 * We rewrite `this.xxx` references then emit the block contents directly
 * (stripping the outer braces), so the hook body ends with `return debouncedValue;`.
 */
function lowerResolve(resolveBody: string, ctx: RewriteContext): string {
  const rewritten = rewriteBody(resolveBody, ctx);
  return indentBlock(rewritten, '  ');
}
