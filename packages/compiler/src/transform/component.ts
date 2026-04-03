import * as babelParser from '@babel/parser';
import * as t from '@babel/types';
import * as _generateModule from '@babel/generator';
import type {
  MeridianDeclarationIR,
  FieldIR,
  GetterIR,
  MethodIR,
  ImportIR,
} from '../ir.js';
import { rewriteBody, toSetterName, type RewriteContext } from './rewrite.js';
import { analyzeDeps, flattenDeps, type ClassContext } from '../analyze/index.js';
import { lowerEffect, indentBlock, indentBlockLines } from './effects.js';

// ESM compat shim
type GenerateFn = (node: t.Node, opts?: Record<string, unknown>) => { code: string };
const generate: GenerateFn =
  ((_generateModule as unknown as { default?: GenerateFn }).default ??
    _generateModule) as GenerateFn;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComponentCodegenOptions {
  declaration: MeridianDeclarationIR;
  imports: ImportIR[];
  /** Absolute or relative path to the source file (used for comments only) */
  filePath: string;
}

/**
 * Lower a `MeridianDeclarationIR` of kind='component' into a string of valid
 * React TSX suitable for writing to disk.
 *
 * The output always starts with `'use client';` because Meridian components
 * are client-side by design.
 */
export function lowerComponent(options: ComponentCodegenOptions): string {
  const { declaration: decl, imports } = options;

  if (decl.kind !== 'component') {
    throw new Error(
      `lowerComponent: expected kind='component', got '${decl.kind}'`,
    );
  }

  // -------------------------------------------------------------------------
  // Classify fields
  // -------------------------------------------------------------------------
  const stateFields: FieldIR[] = decl.fields.filter((f) => f.kind === 'state');
  const refFields: FieldIR[] = decl.fields.filter((f) => f.kind === 'ref');
  const useFields: FieldIR[] = decl.fields.filter((f) => f.kind === 'use');

  // Build the rewrite context for `this` replacement.
  // @use field names are added as plain locals so `this.fieldName` rewrites
  // to `fieldName` in JSX and method bodies.
  const stateFieldSet = new Set(stateFields.map((f) => f.name));
  const stateSetterMap = new Map<string, string>(
    stateFields.map((f) => [f.name, toSetterName(f.name)]),
  );
  const refFieldSet = new Set(refFields.map((f) => f.name));
  const getterNameSet = new Set(decl.getters.map((g) => g.name));
  const methodNameSet = new Set(decl.methods.map((m) => m.name));
  // Treat @use field names the same as getter names for rewrite purposes
  // (both are plain local const bindings after lowering)
  const useFieldNameSet = new Set(useFields.map((f) => f.name));
  const extendedGetterNames = new Set([...getterNameSet, ...useFieldNameSet]);

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
  // Build props parameter
  // -------------------------------------------------------------------------
  const propsParam = buildPropsParam(decl.propsType);

  // -------------------------------------------------------------------------
  // Build function signature
  // -------------------------------------------------------------------------
  const exportKeyword = decl.exportDefault
    ? 'export default function'
    : 'export function';
  const signature = `${exportKeyword} ${decl.name}(${propsParam})`;

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

  // @use fields
  if (useFields.length > 0) {
    bodyLines.push('  // @use fields');
    for (const field of useFields) {
      bodyLines.push(lowerUseField(field, ctx));
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

  // Build ClassContext for dep analysis (effectMethods already computed above)
  const classCtx: ClassContext = {
    stateFields: stateFieldSet,
    propNames: new Set(/* props not enumerable from IR in v1 */),
    getterNames: getterNameSet,
    getterBodies: new Map(
      decl.getters.map((g) => [g.name, g.body]),
    ),
  };

  // Plain methods and effects
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

  // render()
  if (decl.render) {
    bodyLines.push('  // render');
    bodyLines.push(lowerRender(decl.render.body, ctx));
  } else {
    bodyLines.push('  return null;');
  }

  // Trim trailing blank lines from body
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
    bodyLines.pop();
  }

  // -------------------------------------------------------------------------
  // Assemble the file
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

  // React import with hooks
  const hooksPart =
    reactHooks.length > 0 ? `, { ${reactHooks.join(', ')} }` : '';
  lines.push(`import React${hooksPart} from 'react';`);

  // Preserve non-Meridian imports from the source module
  for (const imp of imports) {
    // Skip the Meridian framework import — it has no runtime meaning in output
    if (MERIDIAN_SPECIFIERS.has(imp.moduleSpecifier)) continue;
    // Skip the react import — we've already emitted ours above
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
// Props parameter
// ---------------------------------------------------------------------------

function buildPropsParam(propsType: string | undefined): string {
  if (propsType === undefined) {
    return 'props: Record<string, unknown>';
  }
  return `props: ${propsType}`;
}

// ---------------------------------------------------------------------------
// Field lowering
// ---------------------------------------------------------------------------

function lowerStateField(field: FieldIR): string {
  const setter = toSetterName(field.name);

  if (field.initializer !== undefined) {
    // Use a lazy initializer to avoid re-evaluating the expression on every render
    return `  const [${field.name}, ${setter}] = useState(() => ${field.initializer});`;
  }

  return `  const [${field.name}, ${setter}] = useState<unknown>(undefined);`;
}

function lowerRefField(field: FieldIR): string {
  const typeArg = 'unknown';
  return `  const ${field.name} = useRef<${typeArg}>(null);`;
}

// ---------------------------------------------------------------------------
// @use field lowering
// ---------------------------------------------------------------------------

/**
 * Lower a `@use(PrimitiveName, argsFactory)` field into a hook call.
 *
 * The `argsFactoryBody` from the IR is the source text of the second argument
 * passed to @use — typically an arrow function like `() => [this.props.query, 500]`.
 * We extract the array literal body, rewrite `this.xxx` in each element, then
 * spread the elements as call arguments:
 *
 *   const debouncedQuery = useDebounce(props.query, 500);
 *
 * A TODO comment is emitted above the call so developers know the import for
 * `usePrimitiveName` must be wired up separately.
 */
function lowerUseField(field: FieldIR, ctx: RewriteContext): string {
  const target = field.useTarget;
  if (!target) {
    // Degenerate case — no UseTargetIR; emit a placeholder
    return `  // @use field "${field.name}" has no target information`;
  }

  const hookName = `use${target.primitiveName}`;
  const args = extractAndRewriteArgs(target.argsFactoryBody, ctx);

  const lines: string[] = [];
  lines.push(
    `  // import { ${hookName} } from './${target.primitiveName}.generated.js'; // TODO: wire up import`,
  );
  lines.push(`  const ${field.name} = ${hookName}(${args});`);
  return lines.join('\n');
}

/**
 * Parse the argsFactoryBody string and extract rewritten call arguments.
 *
 * The argsFactoryBody is the text of the second argument to @use, e.g.:
 *   `() => [this.props.query, 500]`
 *
 * We attempt to parse it as an arrow function whose body is an ArrayExpression.
 * Each element of the array becomes an individual argument after this-rewriting.
 *
 * Falls back to calling the factory if it cannot be statically unwrapped.
 */
function extractAndRewriteArgs(argsFactoryBody: string, ctx: RewriteContext): string {
  // Wrap in assignment so Babel can parse the arrow function expression
  const wrapped = `const __f = ${argsFactoryBody};`;

  let parsed: t.File | null = null;
  try {
    parsed = babelParser.parse(wrapped, {
      sourceType: 'script',
      plugins: ['typescript', 'jsx'],
      attachComment: false,
    });
  } catch {
    // parse failed — fall back to calling the factory
    return `...${argsFactoryBody}()`;
  }

  // Walk to the VariableDeclarator init
  const firstStmt = parsed.program.body[0];
  if (!firstStmt || !t.isVariableDeclaration(firstStmt)) {
    return `...${argsFactoryBody}()`;
  }

  const declarator = firstStmt.declarations[0];
  if (!declarator || !t.isVariableDeclarator(declarator)) {
    return `...${argsFactoryBody}()`;
  }

  const init = declarator.init;
  if (!init) return `...${argsFactoryBody}()`;

  // Unwrap arrow function
  let bodyExpr: t.Expression | null = null;

  if (t.isArrowFunctionExpression(init)) {
    const body = init.body;
    if (t.isArrayExpression(body)) {
      bodyExpr = body;
    } else if (t.isBlockStatement(body)) {
      // () => { return [...] }  — look for a single return statement
      const stmts = body.body;
      if (stmts.length === 1 && t.isReturnStatement(stmts[0]) && stmts[0].argument) {
        const ret = stmts[0].argument;
        if (t.isArrayExpression(ret)) {
          bodyExpr = ret;
        }
      }
    }
  } else if (t.isArrayExpression(init)) {
    // Provided directly as an array literal (edge case)
    bodyExpr = init;
  }

  if (!bodyExpr || !t.isArrayExpression(bodyExpr)) {
    // Not an array literal — fall back
    return `...${argsFactoryBody}()`;
  }

  // Generate each element, apply this-rewriting via rewriteBody using a
  // synthetic block wrapper, then strip the wrapper back out.
  type GenerateFn = (node: t.Node, opts?: Record<string, unknown>) => { code: string };
  const genFn: GenerateFn =
    ((generate as unknown as { default?: GenerateFn }).default ?? generate) as GenerateFn;

  const rewrittenArgs = bodyExpr.elements.map((el) => {
    if (!el) return 'undefined';
    if (t.isSpreadElement(el)) {
      // Spread element — generate and rewrite as a block expression
      const elCode = genFn(el.argument).code;
      const blockCode = `{ return ${elCode}; }`;
      const rewritten = rewriteBody(blockCode, ctx);
      // Extract the return expression from `{ return ...; }`
      return `...${extractReturnExpr(rewritten)}`;
    }
    const elCode = genFn(el).code;
    // Wrap in a synthetic return block so rewriteBody can parse it
    const blockCode = `{ return ${elCode}; }`;
    const rewritten = rewriteBody(blockCode, ctx);
    return extractReturnExpr(rewritten);
  });

  return rewrittenArgs.join(', ');
}

/**
 * Extract the expression from a block like `{\n  return expr;\n}`.
 * Returns the raw source of the expression, or the full block as a fallback.
 */
function extractReturnExpr(blockCode: string): string {
  const trimmed = blockCode.trim();
  // Match `{ return <expr>; }` — single return statement
  const match = /^\{[\s\n]*return\s+([\s\S]+?);\s*\}$/.exec(trimmed);
  if (match && match[1] !== undefined) {
    return match[1].trim();
  }
  return blockCode;
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
// Render lowering
// ---------------------------------------------------------------------------

function lowerRender(renderBody: string, ctx: RewriteContext): string {
  const rewrittenBody = rewriteBody(renderBody, ctx);
  return indentBlock(rewrittenBody, '  ');
}

// Re-export helpers that were previously defined locally (used by tests indirectly)
export { indentBlockLines, indentBlock };
