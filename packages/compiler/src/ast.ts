import * as babelParser from '@babel/parser';
import generateModule from '@babel/generator';
import * as t from '@babel/types';

type GenerateFn = (node: t.Node, opts?: Record<string, unknown>) => { code: string };

const generate = (
  (generateModule as unknown as { default?: GenerateFn }).default ??
  (generateModule as unknown as GenerateFn)
);

const PARSER_PLUGINS: babelParser.ParserPlugin[] = [
  'typescript',
  'jsx',
  ['decorators', { version: '2023-11' }] as unknown as babelParser.ParserPlugin,
];

export interface WalkContext {
  ancestors: t.Node[];
  parent?: t.Node;
  key?: string;
  index?: number;
}

export function parseTypeScriptModule(source: string): t.File {
  return babelParser.parse(source, {
    sourceType: 'module',
    plugins: PARSER_PLUGINS,
    attachComment: true,
  });
}

export function parseExpression(source: string): t.Expression {
  return babelParser.parseExpression(source, {
    plugins: PARSER_PLUGINS,
  });
}

export function generateCode(node: t.Node): string {
  return generate(node, { comments: true }).code;
}

export function cloneNode<T extends t.Node | null | undefined>(node: T): T {
  if (!node) {
    return node;
  }

  return t.cloneNode(node, true) as T;
}

export function walkNode(
  node: t.Node | null | undefined,
  visitor: (node: t.Node, context: WalkContext) => void,
  context: WalkContext = { ancestors: [] },
): void {
  if (!node) {
    return;
  }

  visitor(node, context);

  const visitorKeys = t.VISITOR_KEYS[node.type] ?? [];
  const nextAncestors = [...context.ancestors, node];

  for (const key of visitorKeys) {
    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (t.isNode(item)) {
          walkNode(item, visitor, {
            ancestors: nextAncestors,
            parent: node,
            key,
            index,
          });
        }
      });
      continue;
    }

    if (t.isNode(value)) {
      walkNode(value, visitor, {
        ancestors: nextAncestors,
        parent: node,
        key,
      });
    }
  }
}

export function isSuperCallStatement(statement: t.Statement): boolean {
  return (
    t.isExpressionStatement(statement) &&
    t.isCallExpression(statement.expression) &&
    t.isSuper(statement.expression.callee)
  );
}

export function typeAnnotationText(
  node: t.TSTypeAnnotation | t.TypeAnnotation | t.Noop | null | undefined,
): string | undefined {
  if (!node) {
    return undefined;
  }

  if (t.isTSTypeAnnotation(node)) {
    return generateCode(node.typeAnnotation);
  }

  return generateCode(node);
}
