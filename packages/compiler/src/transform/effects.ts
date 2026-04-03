/**
 * Shared effect lowering logic used by both component.ts and primitive.ts.
 *
 * Factored out to avoid duplication between the two lowering pipelines while
 * keeping each pipeline's module surface small.
 */
import { rewriteBody, type RewriteContext } from './rewrite.js';
import { analyzeDeps, flattenDeps, type ClassContext } from '../analyze/index.js';
import type { MethodIR } from '../ir.js';

// ---------------------------------------------------------------------------
// Effect lowering
// ---------------------------------------------------------------------------

/**
 * Lower an @effect or @effect.layout method into a useEffect / useLayoutEffect
 * call. Performs dependency analysis and emits the dep array.
 *
 * Async methods are wrapped in an inner async IIFE:
 *   useEffect(() => { (async () => { ...body... })(); }, [deps])
 *
 * The effect body is rewritten via rewriteBody so `this.xxx` references are
 * replaced with their local variable equivalents before emission.
 */
export function lowerEffect(
  method: MethodIR,
  ctx: RewriteContext,
  classCtx: ClassContext,
): string {
  const hookName = method.kind === 'layoutEffect' ? 'useLayoutEffect' : 'useEffect';

  // Analyze and flatten deps from the raw body (before this-rewriting so
  // the this.xxx references are still present for the analyzer)
  const { deps: rawDeps, hasDynamicAccess } = analyzeDeps(method.body, classCtx);
  const concreteDeps = flattenDeps(rawDeps, classCtx);

  // Build the dep array elements
  const depElements = buildDepArray(concreteDeps);

  // Rewrite the body (this.xxx -> local names)
  const rewrittenBody = rewriteBody(method.body, ctx);

  const lines: string[] = [];

  // Emit diagnostic comment if dynamic access was detected
  if (hasDynamicAccess) {
    lines.push(
      '  /* M008: dynamic this access detected — deps may be incomplete */',
    );
  }

  if (method.async) {
    // Wrap body in an async IIFE:
    //   useEffect(() => {
    //     (async () => { ...body... })();
    //   }, [deps]);
    lines.push(`  ${hookName}(() => {`);
    lines.push(`    (async () => ${rewrittenBody.trim()})();`);
    lines.push(`  }, [${depElements}]);`);
  } else {
    // Synchronous: emit body verbatim inside the hook callback
    const innerLines = indentBlockLines(rewrittenBody, '  ');
    lines.push(`  ${hookName}(() => ${innerLines}, [${depElements}]);`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map concrete dep list to dep array element strings.
 *
 *   state dep  -> field name (already a local variable)
 *   prop dep   -> 'props' (conservative: whole props object in v1)
 *              special case '__all__' -> also 'props'
 */
function buildDepArray(deps: ReturnType<typeof flattenDeps>): string {
  const elements: string[] = [];
  const seen = new Set<string>();

  for (const dep of deps) {
    let element: string;
    if (dep.source === 'state') {
      element = dep.name;
    } else {
      // prop dep (name or '__all__') -> conservative 'props'
      element = 'props';
    }

    if (!seen.has(element)) {
      seen.add(element);
      elements.push(element);
    }
  }

  return elements.join(', ');
}

/**
 * Reformat a block string so it can be inlined as the arrow-function body
 * while keeping the outer braces. Unlike indentBlock (which strips braces),
 * this keeps them but normalises indentation on inner lines.
 *
 * Input:  `{\n  return x;\n}`
 * Output: `{\n    return x;\n  }`   (with the given outer indent applied)
 */
export function indentBlockLines(blockCode: string, outerIndent: string): string {
  const trimmed = blockCode.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1);
    if (!inner.trim()) return '{}';
    const indentedInner = inner
      .split('\n')
      .map((line) => (line.trim() ? `${outerIndent}  ${line.trimStart()}` : ''))
      .join('\n');
    return `{\n${indentedInner}\n${outerIndent}}`;
  }
  return blockCode;
}

/**
 * Given a block string like `{\n  return <div/>;\n}`, strip the outer braces
 * and re-indent the inner content with the given prefix.
 */
export function indentBlock(blockCode: string, indent: string): string {
  const trimmed = blockCode.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return '';
    return inner
      .split('\n')
      .map((line) => `${indent}${line}`)
      .join('\n');
  }
  return `${indent}${blockCode}`;
}
