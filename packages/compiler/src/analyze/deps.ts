import * as babelParser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

// @babel/traverse ships CJS with exports.default = traverse
const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClassContext {
  stateFields: Set<string>;
  propNames: Set<string>; // known prop names if available (may be empty)
  getterNames: Set<string>;
  getterBodies: Map<string, string>; // getter name -> body text for recursive dep resolution
}

export type DependencySource = 'state' | 'prop' | 'getter';

export interface ResolvedDep {
  source: DependencySource;
  name: string;
}

export interface AnalyzedDeps {
  deps: ResolvedDep[];
  hasDynamicAccess: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a body string (block statement with surrounding braces) into a Babel
 * AST File node. Uses the same wrapping strategy as rewrite.ts.
 */
function parseBody(bodyCode: string): t.File | null {
  const wrapped = `(async function __meridian_wrap__() ${bodyCode})`;
  try {
    return babelParser.parse(wrapped, {
      sourceType: 'script',
      plugins: ['typescript', 'jsx'],
      attachComment: false,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// analyzeDeps
// ---------------------------------------------------------------------------

/**
 * Extract all reactive dependencies from a body string.
 * Scans for this.xxx patterns, classifies them, and detects dynamic access.
 * Returns { deps, hasDynamicAccess }.
 *
 * Note: getter deps are returned as-is (source='getter'). Use flattenDeps to
 * resolve them down to concrete state/prop deps.
 */
export function analyzeDeps(bodyCode: string, ctx: ClassContext): AnalyzedDeps {
  const ast = parseBody(bodyCode);
  if (ast === null) {
    return { deps: [], hasDynamicAccess: false };
  }

  const rawDeps: ResolvedDep[] = [];
  let hasDynamicAccess = false;

  // Track seen dep keys to deduplicate
  const seen = new Set<string>();

  function addDep(dep: ResolvedDep): void {
    const key = `${dep.source}:${dep.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      rawDeps.push(dep);
    }
  }

  traverse(ast, {
    // Detect: this[expr] — computed member access on this
    MemberExpression(path) {
      const { object, computed } = path.node;

      if (!t.isThisExpression(object)) return;

      if (computed) {
        hasDynamicAccess = true;
        return;
      }

      // Private field: this.#foo
      if (t.isPrivateName(path.node.property)) {
        hasDynamicAccess = true;
        return;
      }

      if (!t.isIdentifier(path.node.property)) return;

      const memberName = path.node.property.name;

      // this.props.X — check if parent is a MemberExpression
      if (memberName === 'props') {
        const parent = path.parent;

        if (
          t.isMemberExpression(parent) &&
          parent.object === path.node &&
          !parent.computed &&
          t.isIdentifier(parent.property)
        ) {
          // this.props.X — specific prop access
          const propName = parent.property.name;
          addDep({ source: 'prop', name: propName });
          // Skip so we don't also process `this.props` by itself in the parent visit
          path.skip();
        } else {
          // Bare `this.props` access (no further property)
          addDep({ source: 'prop', name: '__all__' });
          path.skip();
        }
        return;
      }

      // Classify as state, getter, or unknown
      if (ctx.stateFields.has(memberName)) {
        addDep({ source: 'state', name: memberName });
        return;
      }

      if (ctx.getterNames.has(memberName)) {
        addDep({ source: 'getter', name: memberName });
        return;
      }

      // Check if it's a known prop accessed via this.propName directly
      if (ctx.propNames.has(memberName)) {
        addDep({ source: 'prop', name: memberName });
        return;
      }

      // Unknown this.xxx — leave unclassified (not added as a dep)
    },

    // Detect: for (const k in this)
    ForInStatement(path) {
      if (t.isThisExpression(path.node.right)) {
        hasDynamicAccess = true;
      }
    },

    // Detect: Object.keys(this), Object.values(this), Object.entries(this)
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      const firstArg = args[0];

      if (
        firstArg !== undefined &&
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object, { name: 'Object' }) &&
        t.isIdentifier(callee.property) &&
        (callee.property.name === 'keys' ||
          callee.property.name === 'values' ||
          callee.property.name === 'entries') &&
        args.length === 1 &&
        t.isThisExpression(firstArg)
      ) {
        hasDynamicAccess = true;
      }
    },
  });

  return { deps: rawDeps, hasDynamicAccess };
}

// ---------------------------------------------------------------------------
// flattenDeps
// ---------------------------------------------------------------------------

/**
 * Flatten getter deps: for each 'getter' dep, recursively analyze the getter's
 * body and replace the getter dep with concrete state/prop deps.
 *
 * Returns only 'state' and 'prop' deps (no 'getter' deps in output).
 * Circular getter dependencies are detected via the `visited` set; a getter
 * already in `visited` contributes no deps for that traversal path.
 */
export function flattenDeps(
  deps: ResolvedDep[],
  ctx: ClassContext,
  visited: Set<string> = new Set(),
): ResolvedDep[] {
  const result: ResolvedDep[] = [];
  const seen = new Set<string>();

  function addConcrete(dep: ResolvedDep): void {
    const key = `${dep.source}:${dep.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(dep);
    }
  }

  for (const dep of deps) {
    if (dep.source === 'state' || dep.source === 'prop') {
      addConcrete(dep);
      continue;
    }

    // dep.source === 'getter' — resolve recursively
    const getterName = dep.name;

    // Circular dependency guard
    if (visited.has(getterName)) {
      // Contributes no deps for this path
      continue;
    }

    const body = ctx.getterBodies.get(getterName);
    if (body === undefined) {
      // Unknown getter body — can't resolve; skip
      continue;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(getterName);

    const { deps: innerDeps } = analyzeDeps(body, ctx);
    const flattened = flattenDeps(innerDeps, ctx, nextVisited);

    for (const concrete of flattened) {
      addConcrete(concrete);
    }
  }

  return result;
}
