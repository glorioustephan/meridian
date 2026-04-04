import * as t from '@babel/types';
import { walkNode } from '../ast.js';

export interface ClassContext {
  stateFields: Set<string>;
  getterNames: Set<string>;
  getterBodies: Map<string, t.BlockStatement>;
  localFields?: Set<string>;
}

export type DependencySource = 'state' | 'prop' | 'getter' | 'local';

export interface ResolvedDep {
  source: DependencySource;
  name: string;
}

export interface AnalyzedDeps {
  deps: ResolvedDep[];
  hasDynamicAccess: boolean;
  hasPrivateAccess: boolean;
}

function isDirectThisMember(
  node: t.MemberExpression,
): node is t.MemberExpression & { object: t.ThisExpression; property: t.Identifier } {
  return (
    t.isThisExpression(node.object) &&
    !node.computed &&
    t.isIdentifier(node.property)
  );
}

export function analyzeDeps(
  node: t.BlockStatement | t.Expression,
  ctx: ClassContext,
): AnalyzedDeps {
  const deps: ResolvedDep[] = [];
  const seen = new Set<string>();
  let hasDynamicAccess = false;
  let hasPrivateAccess = false;

  function addDep(dep: ResolvedDep): void {
    const key = `${dep.source}:${dep.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      deps.push(dep);
    }
  }

  walkNode(node, (current, walkContext) => {
    if (t.isMemberExpression(current)) {
      const parent = walkContext.parent;
      if (
        (parent && t.isAssignmentExpression(parent) && parent.left === current) ||
        (parent && t.isUpdateExpression(parent) && parent.argument === current)
      ) {
        return;
      }

      if (t.isThisExpression(current.object) && current.computed) {
        hasDynamicAccess = true;
        return;
      }

      if (t.isThisExpression(current.object) && t.isPrivateName(current.property)) {
        hasPrivateAccess = true;
        return;
      }

      if (!isDirectThisMember(current)) {
        return;
      }

      if (current.property.name === 'props') {
        if (
          parent &&
          t.isMemberExpression(parent) &&
          parent.object === current &&
          !parent.computed &&
          t.isIdentifier(parent.property)
        ) {
          addDep({ source: 'prop', name: parent.property.name });
          return;
        }

        addDep({ source: 'prop', name: '__all__' });
        return;
      }

      const name = current.property.name;

      if (ctx.stateFields.has(name)) {
        addDep({ source: 'state', name });
        return;
      }

      if (ctx.localFields?.has(name)) {
        addDep({ source: 'local', name });
        return;
      }

      if (ctx.getterNames.has(name)) {
        addDep({ source: 'getter', name });
      }

      return;
    }

    if (t.isForInStatement(current) && t.isThisExpression(current.right)) {
      hasDynamicAccess = true;
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
      hasDynamicAccess = true;
    }
  });

  return { deps, hasDynamicAccess, hasPrivateAccess };
}

export interface FlattenedDeps {
  deps: ResolvedDep[];
  hasCycle: boolean;
}

export function flattenDeps(
  deps: ResolvedDep[],
  ctx: ClassContext,
  visited: Set<string> = new Set(),
): FlattenedDeps {
  const result: ResolvedDep[] = [];
  const seen = new Set<string>();
  let hasCycle = false;

  function addConcrete(dep: ResolvedDep): void {
    const key = `${dep.source}:${dep.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(dep);
    }
  }

  for (const dep of deps) {
    if (dep.source !== 'getter') {
      addConcrete(dep);
      continue;
    }

    if (visited.has(dep.name)) {
      hasCycle = true;
      continue;
    }

    const getterBody = ctx.getterBodies.get(dep.name);
    if (!getterBody) {
      continue;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(dep.name);

    const analyzed = analyzeDeps(getterBody, ctx);
    const flattened = flattenDeps(analyzed.deps, ctx, nextVisited);
    hasCycle ||= flattened.hasCycle;

    for (const concrete of flattened.deps) {
      addConcrete(concrete);
    }
  }

  return { deps: result, hasCycle };
}
