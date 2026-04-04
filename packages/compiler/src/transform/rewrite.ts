import * as t from '@babel/types';
import { cloneNode } from '../ast.js';

export interface RewriteContext {
  stateFields: Set<string>;
  stateSetters: Map<string, string>;
  refFields: Set<string>;
  getterNames: Set<string>;
  methodNames: Set<string>;
  localNames: Set<string>;
}

export function toSetterName(fieldName: string): string {
  return `set${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
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

function rewriteMemberExpression(
  node: t.MemberExpression,
  ctx: RewriteContext,
): t.Expression {
  if (isDirectThisMember(node)) {
    const name = node.property.name;

    if (name === 'props') {
      return t.identifier('props');
    }

    if (
      ctx.stateFields.has(name) ||
      ctx.refFields.has(name) ||
      ctx.getterNames.has(name) ||
      ctx.methodNames.has(name) ||
      ctx.localNames.has(name)
    ) {
      return t.identifier(name);
    }
  }

  const cloned = cloneNode(node);
  cloned.object = rewriteExpression(cloned.object, ctx);

  if (cloned.computed && t.isExpression(cloned.property)) {
    cloned.property = rewriteExpression(cloned.property, ctx);
  }

  return cloned;
}

function rewriteAssignmentExpression(
  node: t.AssignmentExpression,
  ctx: RewriteContext,
): t.Expression {
  if (
    node.operator === '=' &&
    t.isMemberExpression(node.left) &&
    isDirectThisMember(node.left)
  ) {
    const setter = ctx.stateSetters.get(node.left.property.name);
    if (setter) {
      return t.callExpression(t.identifier(setter), [
        rewriteExpression(node.right, ctx),
      ]);
    }
  }

  const cloned = cloneNode(node);
  if (t.isExpression(cloned.left)) {
    cloned.left = rewriteExpression(cloned.left, ctx) as t.LVal;
  }
  cloned.right = rewriteExpression(cloned.right, ctx);
  return cloned;
}

function rewriteArrayExpression(
  node: t.ArrayExpression,
  ctx: RewriteContext,
): t.ArrayExpression {
  const cloned = cloneNode(node);
  cloned.elements = cloned.elements.map((element) => {
    if (!element) {
      return element;
    }

    if (t.isSpreadElement(element)) {
      return t.spreadElement(rewriteExpression(element.argument, ctx));
    }

    return rewriteExpression(element, ctx);
  });
  return cloned;
}

function rewriteObjectExpression(
  node: t.ObjectExpression,
  ctx: RewriteContext,
): t.ObjectExpression {
  const cloned = cloneNode(node);
  cloned.properties = cloned.properties.map((property) => {
    if (t.isSpreadElement(property)) {
      return t.spreadElement(rewriteExpression(property.argument, ctx));
    }

    if (t.isObjectProperty(property)) {
      const next = cloneNode(property);
      if (t.isExpression(next.value)) {
        next.value = rewriteExpression(next.value, ctx);
      }
      return next;
    }

    if (t.isObjectMethod(property)) {
      const next = cloneNode(property);
      next.body = rewriteBlockStatement(next.body, ctx);
      return next;
    }

    return property;
  });
  return cloned;
}

function rewriteTemplateLiteral(
  node: t.TemplateLiteral,
  ctx: RewriteContext,
): t.TemplateLiteral {
  const cloned = cloneNode(node);
  cloned.expressions = cloned.expressions.map((expression) =>
    t.isExpression(expression) ? rewriteExpression(expression, ctx) : expression,
  );
  return cloned;
}

function rewriteCallExpression(
  node: t.CallExpression,
  ctx: RewriteContext,
): t.CallExpression {
  const cloned = cloneNode(node);
  if (t.isExpression(cloned.callee)) {
    cloned.callee = rewriteExpression(cloned.callee, ctx);
  }
  cloned.arguments = cloned.arguments.map((argument) => {
    if (t.isSpreadElement(argument)) {
      return t.spreadElement(rewriteExpression(argument.argument, ctx));
    }
    if (t.isExpression(argument)) {
      return rewriteExpression(argument, ctx);
    }
    return argument;
  });
  return cloned;
}

function rewriteJSXElement<T extends t.JSXElement | t.JSXFragment>(
  node: T,
  ctx: RewriteContext,
): T {
  const cloned = cloneNode(node);

  if (t.isJSXElement(cloned)) {
    cloned.openingElement.attributes = cloned.openingElement.attributes.map((attribute) => {
      if (t.isJSXSpreadAttribute(attribute)) {
        const next = cloneNode(attribute);
        next.argument = rewriteExpression(attribute.argument, ctx);
        return next;
      }

      if (
        t.isJSXAttribute(attribute) &&
        attribute.value &&
        t.isJSXExpressionContainer(attribute.value) &&
        !t.isJSXEmptyExpression(attribute.value.expression)
      ) {
        const next = cloneNode(attribute);
        next.value = t.jsxExpressionContainer(
          rewriteExpression(attribute.value.expression, ctx),
        );
        return next;
      }

      return attribute;
    });
  }

  const children = cloned.children.map((child) => {
    if (t.isJSXExpressionContainer(child) && child.expression && !t.isJSXEmptyExpression(child.expression)) {
      const next = cloneNode(child);
      next.expression = rewriteExpression(child.expression, ctx);
      return next;
    }

    if (t.isJSXElement(child)) {
      return rewriteJSXElement(child, ctx);
    }

    if (t.isJSXFragment(child)) {
      return rewriteJSXElement(child, ctx);
    }

    return child;
  });
  cloned.children = children as T['children'];
  return cloned;
}

function rewriteStatement(statement: t.Statement, ctx: RewriteContext): t.Statement {
  if (t.isExpressionStatement(statement)) {
    return t.expressionStatement(rewriteExpression(statement.expression, ctx));
  }

  if (t.isReturnStatement(statement)) {
    return t.returnStatement(
      statement.argument ? rewriteExpression(statement.argument, ctx) : null,
    );
  }

  if (t.isVariableDeclaration(statement)) {
    const cloned = cloneNode(statement);
    cloned.declarations = cloned.declarations.map((declaration) => {
      const next = cloneNode(declaration);
      if (next.init) {
        next.init = rewriteExpression(next.init, ctx);
      }
      return next;
    });
    return cloned;
  }

  if (t.isIfStatement(statement)) {
    const cloned = cloneNode(statement);
    cloned.test = rewriteExpression(cloned.test, ctx);
    cloned.consequent = rewriteStatementOrBlock(cloned.consequent, ctx);
    if (cloned.alternate) {
      cloned.alternate = rewriteStatementOrBlock(cloned.alternate, ctx);
    }
    return cloned;
  }

  if (t.isBlockStatement(statement)) {
    return rewriteBlockStatement(statement, ctx);
  }

  if (t.isForStatement(statement)) {
    const cloned = cloneNode(statement);
    if (cloned.init && t.isExpression(cloned.init)) {
      cloned.init = rewriteExpression(cloned.init, ctx);
    }
    if (cloned.test) {
      cloned.test = rewriteExpression(cloned.test, ctx);
    }
    if (cloned.update) {
      cloned.update = rewriteExpression(cloned.update, ctx);
    }
    cloned.body = rewriteStatementOrBlock(cloned.body, ctx);
    return cloned;
  }

  if (t.isForInStatement(statement) || t.isForOfStatement(statement)) {
    const cloned = cloneNode(statement);
    if (t.isExpression(cloned.right)) {
      cloned.right = rewriteExpression(cloned.right, ctx);
    }
    if (t.isExpression(cloned.left)) {
      cloned.left = rewriteExpression(cloned.left, ctx) as t.ForXStatement['left'];
    }
    cloned.body = rewriteStatementOrBlock(cloned.body, ctx);
    return cloned;
  }

  if (t.isWhileStatement(statement) || t.isDoWhileStatement(statement)) {
    const cloned = cloneNode(statement);
    cloned.test = rewriteExpression(cloned.test, ctx);
    cloned.body = rewriteStatementOrBlock(cloned.body, ctx);
    return cloned;
  }

  if (t.isTryStatement(statement)) {
    const cloned = cloneNode(statement);
    cloned.block = rewriteBlockStatement(cloned.block, ctx);
    if (cloned.handler?.body) {
      cloned.handler.body = rewriteBlockStatement(cloned.handler.body, ctx);
    }
    if (cloned.finalizer) {
      cloned.finalizer = rewriteBlockStatement(cloned.finalizer, ctx);
    }
    return cloned;
  }

  return cloneNode(statement);
}

function rewriteStatementOrBlock(
  node: t.Statement,
  ctx: RewriteContext,
): t.Statement {
  return t.isBlockStatement(node) ? rewriteBlockStatement(node, ctx) : rewriteStatement(node, ctx);
}

export function rewriteExpression(expression: t.Expression, ctx: RewriteContext): t.Expression {
  if (t.isAssignmentExpression(expression)) {
    return rewriteAssignmentExpression(expression, ctx);
  }

  if (t.isMemberExpression(expression)) {
    return rewriteMemberExpression(expression, ctx);
  }

  if (t.isCallExpression(expression)) {
    return rewriteCallExpression(expression, ctx);
  }

  if (t.isArrowFunctionExpression(expression)) {
    const cloned = cloneNode(expression);
    if (t.isBlockStatement(cloned.body)) {
      cloned.body = rewriteBlockStatement(cloned.body, ctx);
    } else {
      cloned.body = rewriteExpression(cloned.body, ctx);
    }
    return cloned;
  }

  if (t.isFunctionExpression(expression)) {
    const cloned = cloneNode(expression);
    cloned.body = rewriteBlockStatement(cloned.body, ctx);
    return cloned;
  }

  if (t.isConditionalExpression(expression)) {
    const cloned = cloneNode(expression);
    cloned.test = rewriteExpression(cloned.test, ctx);
    cloned.consequent = rewriteExpression(cloned.consequent, ctx);
    cloned.alternate = rewriteExpression(cloned.alternate, ctx);
    return cloned;
  }

  if (t.isBinaryExpression(expression) || t.isLogicalExpression(expression)) {
    const cloned = cloneNode(expression);
    if (t.isExpression(cloned.left)) {
      cloned.left = rewriteExpression(cloned.left, ctx);
    }
    cloned.right = rewriteExpression(cloned.right, ctx);
    return cloned;
  }

  if (
    t.isUnaryExpression(expression) ||
    t.isAwaitExpression(expression) ||
    t.isYieldExpression(expression)
  ) {
    const cloned = cloneNode(expression);
    if ('argument' in cloned && cloned.argument) {
      cloned.argument = rewriteExpression(cloned.argument, ctx);
    }
    return cloned;
  }

  if (t.isNewExpression(expression)) {
    const cloned = cloneNode(expression);
    if (t.isExpression(cloned.callee)) {
      cloned.callee = rewriteExpression(cloned.callee, ctx);
    }
    cloned.arguments = (cloned.arguments ?? []).map((argument) => {
      if (t.isSpreadElement(argument)) {
        return t.spreadElement(rewriteExpression(argument.argument, ctx));
      }
      return t.isExpression(argument) ? rewriteExpression(argument, ctx) : argument;
    });
    return cloned;
  }

  if (t.isSequenceExpression(expression)) {
    const cloned = cloneNode(expression);
    cloned.expressions = cloned.expressions.map((current) => rewriteExpression(current, ctx));
    return cloned;
  }

  if (t.isArrayExpression(expression)) {
    return rewriteArrayExpression(expression, ctx);
  }

  if (t.isObjectExpression(expression)) {
    return rewriteObjectExpression(expression, ctx);
  }

  if (t.isTemplateLiteral(expression)) {
    return rewriteTemplateLiteral(expression, ctx);
  }

  if (t.isTaggedTemplateExpression(expression)) {
    const cloned = cloneNode(expression);
    cloned.tag = rewriteExpression(cloned.tag, ctx);
    cloned.quasi = rewriteTemplateLiteral(cloned.quasi, ctx);
    return cloned;
  }

  if (t.isTSAsExpression(expression) || t.isTSSatisfiesExpression(expression) || t.isTSNonNullExpression(expression) || t.isTypeCastExpression(expression)) {
    const cloned = cloneNode(expression);
    cloned.expression = rewriteExpression(cloned.expression, ctx);
    return cloned;
  }

  if (t.isParenthesizedExpression(expression)) {
    const cloned = cloneNode(expression);
    cloned.expression = rewriteExpression(cloned.expression, ctx);
    return cloned;
  }

  if (t.isJSXElement(expression) || t.isJSXFragment(expression)) {
    return rewriteJSXElement(expression, ctx);
  }

  return cloneNode(expression);
}

export function rewriteBlockStatement(
  block: t.BlockStatement,
  ctx: RewriteContext,
): t.BlockStatement {
  const cloned = cloneNode(block);
  cloned.body = cloned.body.map((statement) => rewriteStatement(statement, ctx));
  return cloned;
}
