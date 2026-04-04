import { generateCode } from '../ast.js';
import { analyzeDeps, flattenDeps, type ClassContext } from '../analyze/index.js';
import type { MethodIR } from '../ir.js';
import { rewriteBlockStatement, type RewriteContext } from './rewrite.js';

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

function depArraySource(deps: ReturnType<typeof flattenDeps>['deps']): string {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const dep of deps) {
    const source =
      dep.source === 'state' || dep.source === 'local'
        ? dep.name
        : dep.name === '__all__'
          ? 'props'
          : `props.${dep.name}`;

    if (!seen.has(source)) {
      seen.add(source);
      values.push(source);
    }
  }

  return values.join(', ');
}

export function lowerEffect(
  method: MethodIR,
  ctx: RewriteContext,
  classContext: ClassContext,
): string {
  const hookName = method.kind === 'layoutEffect' ? 'useLayoutEffect' : 'useEffect';
  const analyzed = analyzeDeps(method.body, classContext);
  const flattened = flattenDeps(analyzed.deps, classContext);
  const deps = depArraySource(flattened.deps);
  const rewrittenBody = rewriteBlockStatement(method.body, ctx);
  const bodySource = blockInner(generateCode(rewrittenBody));

  if (method.async) {
    return [
      `  ${hookName}(() => {`,
      `    void (async () => {`,
      ...(bodySource ? indent(bodySource, '      ').split('\n') : []),
      `    })();`,
      `  }, [${deps}]);`,
    ].join('\n');
  }

  return [
    `  ${hookName}(() => {`,
    ...(bodySource ? indent(bodySource, '    ').split('\n') : []),
    `  }, [${deps}]);`,
  ].join('\n');
}
