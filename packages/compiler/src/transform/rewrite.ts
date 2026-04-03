import * as babelParser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as _generateModule from '@babel/generator';

// ESM compat shim: same pattern as parser/index.ts
type GenerateFn = (node: t.Node, opts?: Record<string, unknown>) => { code: string };
const generate: GenerateFn =
  ((_generateModule as unknown as { default?: GenerateFn }).default ??
    _generateModule) as GenerateFn;

// @babel/traverse ships CJS with exports.default = traverse
type TraverseFn = typeof _traverse;
const traverse: TraverseFn =
  ((_traverse as unknown as { default?: TraverseFn }).default ?? _traverse) as TraverseFn;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RewriteContext {
  /** Names of @state fields */
  stateFields: Set<string>;
  /** fieldName -> setter name, e.g. "count" -> "setCount" */
  stateSetters: Map<string, string>;
  /** Names of @ref fields */
  refFields: Set<string>;
  /** Names of getter properties */
  getterNames: Set<string>;
  /** Names of plain methods */
  methodNames: Set<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a React setter name from a state field name.
 * "count" -> "setCount", "myValue" -> "setMyValue"
 */
export function toSetterName(fieldName: string): string {
  return `set${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
}

// ---------------------------------------------------------------------------
// Core rewrite
// ---------------------------------------------------------------------------

/**
 * Rewrite `this.xxx` references inside a body code string using Babel AST
 * traversal. The `bodyCode` is expected to be a block statement string
 * (with surrounding braces) as produced by @babel/generator on a
 * ClassMethod body.
 *
 * Rewrites applied:
 *   - `this.props.X`           -> `props.X`
 *   - `this.stateField`        -> `stateField`           (read)
 *   - `this.stateField = val`  -> `setStateField(val)`   (write via AssignmentExpression)
 *   - `this.refField`          -> `refField`
 *   - `this.getterName`        -> `getterName`
 *   - `this.methodName`        -> `methodName`
 *   - anything else            -> left as-is
 */
export function rewriteBody(bodyCode: string, ctx: RewriteContext): string {
  // Wrap in an async function so `await` inside bodies is parsed correctly.
  // We parse as a script so we don't need sourceType:'module'.
  const wrapped = `(async function __meridian_wrap__() ${bodyCode})`;

  let ast: t.File;
  try {
    ast = babelParser.parse(wrapped, {
      sourceType: 'script',
      plugins: ['typescript', 'jsx'],
      attachComment: true,
    });
  } catch {
    // If parsing fails (e.g. the body has JSX with decorators), return as-is
    return bodyCode;
  }

  // Track nodes that need replacement so we can do it in the exit phase
  // after children have been visited. We use a WeakMap keyed on the parent
  // node to store replacement info.
  //
  // Strategy:
  //   1. Collect AssignmentExpression nodes where left is `this.stateField`
  //      and replace the whole assignment with a setter call node.
  //   2. Replace remaining `this.xxx` MemberExpression nodes with identifiers
  //      or `props.xxx`.
  //
  // We must handle assignments BEFORE member-expression replacement so the
  // left-hand `this.stateField` isn't replaced with a bare identifier first.

  traverse(ast, {
    // Handle `this.stateField = value` assignments
    AssignmentExpression(path) {
      const { left, right, operator } = path.node;

      // Only handle `=` for now (+=, -=, etc. are left as-is since we can't
      // naively convert them without reading the state value)
      if (operator !== '=') return;
      if (!t.isMemberExpression(left)) return;
      if (!t.isThisExpression(left.object)) return;
      if (left.computed) return;
      if (!t.isIdentifier(left.property)) return;

      const fieldName = left.property.name;
      const setter = ctx.stateSetters.get(fieldName);
      if (!setter) return;

      // Replace `this.stateField = val` with `setStateField(val)`.
      // Do NOT skip after replaceWith — Babel will re-enter the new CallExpression
      // and the MemberExpression visitor will correctly rewrite any `this.xxx`
      // references inside the right-hand side value (e.g. constructor params).
      path.replaceWith(t.callExpression(t.identifier(setter), [right]));
    },

    // Handle `this.xxx` member expression reads
    MemberExpression(path) {
      const { object, property, computed } = path.node;

      if (!t.isThisExpression(object)) return;
      if (computed) return;
      if (!t.isIdentifier(property)) return;

      const propName = property.name;

      // `this.props` -> `props` identifier, but only if the PARENT is also a
      // MemberExpression (i.e. `this.props.foo`). We replace `this.props`
      // with `props` and the parent naturally becomes `props.foo`.
      if (propName === 'props') {
        path.replaceWith(t.identifier('props'));
        path.skip();
        return;
      }

      // State field reads (assignment case handled above)
      if (ctx.stateFields.has(propName)) {
        path.replaceWith(t.identifier(propName));
        path.skip();
        return;
      }

      // Ref fields
      if (ctx.refFields.has(propName)) {
        path.replaceWith(t.identifier(propName));
        path.skip();
        return;
      }

      // Getter names
      if (ctx.getterNames.has(propName)) {
        path.replaceWith(t.identifier(propName));
        path.skip();
        return;
      }

      // Method names
      if (ctx.methodNames.has(propName)) {
        path.replaceWith(t.identifier(propName));
        path.skip();
        return;
      }

      // Unknown `this.xxx` — leave as-is (per spec: do not error in codegen)
    },
  });

  // Re-generate. The wrapper is `(async function __meridian_wrap__() { body })`
  // which parses as ExpressionStatement > FunctionExpression (parenthesized).
  // Extract the function body BlockStatement and regenerate it.
  const program = ast.program;
  const exprStmt = program.body[0];
  if (!exprStmt || !t.isExpressionStatement(exprStmt)) {
    return bodyCode;
  }

  const expr = exprStmt.expression;
  if (!t.isFunctionExpression(expr)) {
    return bodyCode;
  }

  return generate(expr.body).code;
}
