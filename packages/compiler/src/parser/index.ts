import * as babelParser from '@babel/parser';
import * as t from '@babel/types';
import * as _generatorModule from '@babel/generator';
import type {
  MeridianModuleIR,
  MeridianDeclarationIR,
  FieldIR,
  GetterIR,
  MethodIR,
  RenderIR,
  ResolveIR,
  ConstructorIR,
  ConstructorParamIR,
  ImportIR,
  DependencyRef,
  SourceLocationIR,
  MeridianDiagnostic,
} from '../ir.js';
import { makeDiagnostic } from '../diagnostics.js';

// ESM compat shim: @babel/generator ships CJS with `exports.default = generate`.
// With esModuleInterop:false the namespace import gives us the module object.
// At runtime `_generatorModule.default` is the callable generate function.
type GenerateFn = (ast: t.Node, opts?: Record<string, unknown>) => { code: string };
const generate: GenerateFn =
  ((_generatorModule as unknown as { default?: GenerateFn }).default ?? _generatorModule) as GenerateFn;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loc(node: t.Node): SourceLocationIR {
  return { line: node.loc?.start.line ?? 0, column: node.loc?.start.column ?? 0 };
}

function bodyText(node: t.Node): string {
  return generate(node as Parameters<typeof generate>[0]).code;
}

/**
 * Extract a readable type string from a TSTypeAnnotation wrapper node or a
 * raw TS type node. Babel stores type annotations as a `TSTypeAnnotation`
 * wrapper whose `.typeAnnotation` property holds the actual type AST node.
 * `@babel/generator` crashes if given the wrapper directly, so we unwrap it.
 */
function typeAnnotationText(
  node: t.TSTypeAnnotation | t.TypeAnnotation | t.Noop | null | undefined,
): string | undefined {
  if (!node) return undefined;
  if (t.isTSTypeAnnotation(node)) {
    return bodyText(node.typeAnnotation);
  }
  // t.TypeAnnotation (Flow) — generate it as-is; unlikely in TS-only files
  return bodyText(node);
}

/**
 * Resolve a decorator to its canonical name for classification purposes.
 * Returns one of: 'state' | 'ref' | 'effect' | 'effect.layout' | 'use' | <unknown string>
 */
function decoratorName(decorator: t.Decorator): string {
  const expr = decorator.expression;

  // @state, @ref, @effect — bare identifiers
  if (t.isIdentifier(expr)) {
    return expr.name;
  }

  // @effect.layout — MemberExpression
  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.object) &&
    t.isIdentifier(expr.property) &&
    !expr.computed
  ) {
    return `${expr.object.name}.${expr.property.name}`;
  }

  // @use(Primitive, factory) — CallExpression
  if (t.isCallExpression(expr)) {
    const callee = expr.callee;
    if (t.isIdentifier(callee)) {
      return callee.name;
    }
    // @effect.layout() as a call (unlikely but defensive)
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
      return `${callee.object.name}.${callee.property.name}`;
    }
  }

  return '<unknown>';
}

const SUPPORTED_DECORATORS = new Set(['state', 'ref', 'effect', 'effect.layout', 'use']);

/**
 * Scan a node for `this.xxx` member expressions and classify them against
 * known sets of state fields and getter names. Props classification is
 * best-effort (can't be resolved without the type system in Phase 2).
 *
 * Uses `t.traverseFast` which works on any node type without requiring a
 * scope or parentPath — unlike `@babel/traverse` which requires a File/Program.
 */
function inferDependencies(
  node: t.Node,
  stateNames: ReadonlySet<string>,
  getterNames: ReadonlySet<string>,
): DependencyRef[] {
  const deps: DependencyRef[] = [];
  const seen = new Set<string>();

  t.traverseFast(node, (child) => {
    if (!t.isMemberExpression(child)) return;

    const { object, property, computed } = child;
    if (!t.isThisExpression(object)) return;

    // Dynamic access: this[expr] — skip
    if (computed) return;

    if (!t.isIdentifier(property)) return;

    const name = property.name;
    if (seen.has(name)) return;
    seen.add(name);

    if (stateNames.has(name)) {
      deps.push({ source: 'state', name });
    } else if (getterNames.has(name)) {
      deps.push({ source: 'getter', name });
    }
    // Otherwise it could be a prop or method call — omit for now; Phase 4 handles full inference
  });

  return deps;
}

/**
 * Extract the superclass identifier name from a class declaration's superClass.
 * Handles plain `Identifier` and `TSAsExpression`-wrapped identifiers.
 */
function superClassName(superClass: t.Expression | null | undefined): string | null {
  if (!superClass) return null;
  if (t.isIdentifier(superClass)) return superClass.name;
  return null;
}

/**
 * Resolve the `propsType` string from the first type parameter of a superclass
 * e.g. `extends Component<{ initial: number }>` → `{ initial: number }`
 */
function extractPropsType(
  superTypeParameters: t.TSTypeParameterInstantiation | undefined | null,
): string | undefined {
  if (!superTypeParameters) return undefined;
  const first = superTypeParameters.params[0];
  if (!first) return undefined;
  return bodyText(first);
}

/**
 * Extract the `UseTargetIR` from a `@use(Primitive, factory)` decorator.
 */
function extractUseTarget(
  decorator: t.Decorator,
): { primitiveName: string; argsFactoryBody: string } | null {
  const expr = decorator.expression;
  if (!t.isCallExpression(expr)) return null;

  const [firstArg, secondArg] = expr.arguments;
  if (!firstArg) return null;

  const primitiveName = t.isIdentifier(firstArg)
    ? firstArg.name
    : bodyText(firstArg);

  const argsFactoryBody = secondArg ? bodyText(secondArg) : '() => []';

  return { primitiveName, argsFactoryBody };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseModule(source: string, filePath: string): MeridianModuleIR {
  const diagnostics: MeridianDiagnostic[] = [];

  // -------------------------------------------------------------------------
  // Parse
  // -------------------------------------------------------------------------
  const ast = babelParser.parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
    attachComment: true,
  });

  // -------------------------------------------------------------------------
  // Detect 'use client' directive
  // -------------------------------------------------------------------------
  let clientDirective = false;

  // Babel captures `'use client'` either as a Directive node on the Program
  // or (less commonly) as the first ExpressionStatement with a StringLiteral.
  const programDirectives = ast.program.directives ?? [];
  if (programDirectives.some((d) => d.value.value === 'use client')) {
    clientDirective = true;
  }

  if (!clientDirective) {
    // Check first expression statement
    const firstStmt = ast.program.body[0];
    if (
      firstStmt &&
      t.isExpressionStatement(firstStmt) &&
      t.isStringLiteral(firstStmt.expression) &&
      firstStmt.expression.value === 'use client'
    ) {
      clientDirective = true;
    }
  }

  // -------------------------------------------------------------------------
  // Collect imports
  // -------------------------------------------------------------------------
  const imports: ImportIR[] = [];

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue;

    const namedBindings: string[] = [];
    let defaultBinding: string | undefined;

    for (const specifier of node.specifiers) {
      if (t.isImportSpecifier(specifier)) {
        namedBindings.push(
          t.isIdentifier(specifier.local) ? specifier.local.name : specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value,
        );
      } else if (t.isImportDefaultSpecifier(specifier)) {
        defaultBinding = specifier.local.name;
      }
    }

    const entry: ImportIR = { moduleSpecifier: node.source.value, namedBindings };
    if (defaultBinding !== undefined) entry.defaultBinding = defaultBinding;
    imports.push(entry);
  }

  // -------------------------------------------------------------------------
  // Find Meridian class declarations
  // -------------------------------------------------------------------------
  const declarations: MeridianDeclarationIR[] = [];

  for (const node of ast.program.body) {
    // Support: `export default class X extends ...` and `export class X extends ...`
    // and bare `class X extends ...`
    let classNode: t.ClassDeclaration | null = null;
    let isExportDefault = false;

    if (t.isClassDeclaration(node)) {
      classNode = node;
    } else if (t.isExportDefaultDeclaration(node) && t.isClassDeclaration(node.declaration)) {
      classNode = node.declaration;
      isExportDefault = true;
    } else if (t.isExportNamedDeclaration(node) && node.declaration && t.isClassDeclaration(node.declaration)) {
      classNode = node.declaration;
    }

    if (!classNode) continue;

    const superName = superClassName(classNode.superClass);
    const className = classNode.id?.name ?? '<anonymous>';

    // M004: ServerComponent (check before the Meridian filter)
    if (className === 'ServerComponent' || superName === 'ServerComponent') {
      diagnostics.push(
        makeDiagnostic('M004', 'error', filePath, loc(classNode).line, loc(classNode).column),
      );
      continue;
    }

    if (superName !== 'Component' && superName !== 'Primitive') continue;

    const kind: MeridianDeclarationIR['kind'] = superName === 'Component' ? 'component' : 'primitive';

    // M002: decorated inheritance — if the superclass itself extends something
    // We can't fully detect this at parse time without type info, but we check
    // if the superTypeParameters contain suspicious nested types (best-effort).
    // The main check: if classNode.superClass is not a plain identifier but
    // itself a class expression or complex expression, that implies deep nesting.
    // In practice, M002 is enforced downstream; here we emit it if superClass
    // is not a plain Identifier (i.e. something like `Foo extends Bar.Baz`).
    // Simple heuristic — if classNode.superClass is a MemberExpression, warn.
    if (classNode.superClass && t.isMemberExpression(classNode.superClass)) {
      diagnostics.push(
        makeDiagnostic('M002', 'error', filePath, loc(classNode).line, loc(classNode).column),
      );
    }

    // Extract superTypeParameters for propsType
    const superTypeParams = (classNode as t.ClassDeclaration & {
      superTypeParameters?: t.TSTypeParameterInstantiation;
    }).superTypeParameters;
    const propsType = extractPropsType(superTypeParams);

    // -----------------------------------------------------------------------
    // Walk class body
    // -----------------------------------------------------------------------
    const fields: FieldIR[] = [];
    const getters: GetterIR[] = [];
    const methods: MethodIR[] = [];
    let render: RenderIR | undefined;
    let resolve: ResolveIR | undefined;
    let constructor: ConstructorIR | undefined;

    // Collect state field names and getter names for dependency inference
    // (two-pass: first scan all fields/getters, then infer deps)
    const stateNames = new Set<string>();
    const refNames = new Set<string>();
    const useNames = new Set<string>();
    const getterNamesSet = new Set<string>();

    // First pass: classify members to build sets for dep inference
    for (const member of classNode.body.body) {
      if (t.isClassProperty(member) || t.isClassAccessorProperty(member)) {
        const keyName = t.isIdentifier(member.key) ? member.key.name : null;
        if (!keyName) continue;

        const decorators = (member.decorators ?? []) as t.Decorator[];
        for (const dec of decorators) {
          const name = decoratorName(dec);
          if (name === 'state') stateNames.add(keyName);
          else if (name === 'ref') refNames.add(keyName);
          else if (name === 'use') useNames.add(keyName);
        }
      } else if (t.isClassMethod(member) && member.kind === 'get') {
        const keyName = t.isIdentifier(member.key) ? member.key.name : null;
        if (keyName) getterNamesSet.add(keyName);
      }
    }

    // Second pass: full extraction
    for (const member of classNode.body.body) {
      // ------------------------------------------------------------------
      // Class properties / fields
      // ------------------------------------------------------------------
      if (t.isClassProperty(member)) {
        const keyName = t.isIdentifier(member.key) ? member.key.name : null;
        if (!keyName) continue;

        const decorators = (member.decorators ?? []) as t.Decorator[];

        // Check for unsupported / M005 decorators
        for (const dec of decorators) {
          const name = decoratorName(dec);
          if (name === 'raw') {
            diagnostics.push(
              makeDiagnostic('M005', 'error', filePath, loc(dec).line, loc(dec).column),
            );
          } else if (!SUPPORTED_DECORATORS.has(name) && name !== '<unknown>') {
            diagnostics.push(
              makeDiagnostic('M003', 'error', filePath, loc(dec).line, loc(dec).column, {
                name,
              }),
            );
          } else if (name === '<unknown>') {
            diagnostics.push(
              makeDiagnostic('M003', 'error', filePath, loc(dec).line, loc(dec).column, {
                name: bodyText(dec.expression),
              }),
            );
          }
        }

        // Determine field kind from decorator
        let fieldKind: FieldIR['kind'] = 'plain';
        let useTarget: FieldIR['useTarget'];

        const primaryDec = decorators[0];
        if (primaryDec) {
          const name = decoratorName(primaryDec);
          if (name === 'state') fieldKind = 'state';
          else if (name === 'ref') fieldKind = 'ref';
          else if (name === 'use') {
            fieldKind = 'use';
            const target = extractUseTarget(primaryDec);
            if (target) useTarget = target;
          }
        }

        const initializer = member.value ? bodyText(member.value) : undefined;

        const field: FieldIR = {
          name: keyName,
          kind: fieldKind,
          location: loc(member),
          ...(initializer !== undefined ? { initializer } : {}),
          ...(useTarget !== undefined ? { useTarget } : {}),
        };
        fields.push(field);
        continue;
      }

      // ------------------------------------------------------------------
      // Class methods
      // ------------------------------------------------------------------
      if (t.isClassMethod(member)) {
        const keyName = t.isIdentifier(member.key) ? member.key.name : null;

        // constructor
        if (member.kind === 'constructor') {
          const params: ConstructorParamIR[] = member.params.map((p): ConstructorParamIR => {
            if (t.isIdentifier(p)) {
              const typeStr = typeAnnotationText(p.typeAnnotation);
              return {
                name: p.name,
                optional: p.optional ?? false,
                ...(typeStr !== undefined ? { type: typeStr } : {}),
              };
            }
            if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) {
              const typeStr = typeAnnotationText((p.left as t.Identifier).typeAnnotation);
              return {
                name: p.left.name,
                optional: true,
                ...(typeStr !== undefined ? { type: typeStr } : {}),
              };
            }
            if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
              return { name: `...${p.argument.name}`, optional: false };
            }
            // TSParameterProperty (e.g. `private name: string`)
            if (t.isTSParameterProperty(p)) {
              const inner = p.parameter;
              if (t.isIdentifier(inner)) {
                const typeStr = typeAnnotationText(inner.typeAnnotation);
                return {
                  name: inner.name,
                  optional: inner.optional ?? false,
                  ...(typeStr !== undefined ? { type: typeStr } : {}),
                };
              }
              if (t.isAssignmentPattern(inner) && t.isIdentifier(inner.left)) {
                const typeStr = typeAnnotationText((inner.left as t.Identifier).typeAnnotation);
                return {
                  name: inner.left.name,
                  optional: true,
                  ...(typeStr !== undefined ? { type: typeStr } : {}),
                };
              }
            }
            return { name: bodyText(p), optional: false };
          });

          constructor = {
            params,
            body: bodyText(member.body),
            location: loc(member),
          };
          continue;
        }

        // getter
        if (member.kind === 'get' && keyName) {
          const deps = inferDependencies(member.body, stateNames, getterNamesSet);
          getters.push({
            name: keyName,
            body: bodyText(member.body),
            dependencies: deps,
            location: loc(member),
          });
          continue;
        }

        // render()
        if (member.kind === 'method' && keyName === 'render') {
          render = {
            body: bodyText(member.body),
            location: loc(member),
          };
          continue;
        }

        // resolve()
        if (member.kind === 'method' && keyName === 'resolve') {
          const returnTypeAnnotation = member.returnType as t.TSTypeAnnotation | null | undefined;
          const returnType = typeAnnotationText(returnTypeAnnotation);
          resolve = {
            body: bodyText(member.body),
            ...(returnType !== undefined ? { returnType } : {}),
            location: loc(member),
          };
          continue;
        }

        // Decorated methods: @effect, @effect.layout
        if (member.kind === 'method' && keyName) {
          const decorators = (member.decorators ?? []) as t.Decorator[];

          // Validate decorators on methods
          for (const dec of decorators) {
            const name = decoratorName(dec);
            if (name === 'raw') {
              diagnostics.push(
                makeDiagnostic('M005', 'error', filePath, loc(dec).line, loc(dec).column),
              );
            } else if (!SUPPORTED_DECORATORS.has(name) && name !== '<unknown>' && name !== 'effect' && name !== 'effect.layout') {
              // Already covered above; @state/@ref/@use on a method is unusual but won't be double-emitted
            }
          }

          const primaryDec = decorators[0];
          let methodKind: MethodIR['kind'] = 'method';

          if (primaryDec) {
            const name = decoratorName(primaryDec);
            if (name === 'effect') methodKind = 'effect';
            else if (name === 'effect.layout') methodKind = 'layoutEffect';
            else if (!SUPPORTED_DECORATORS.has(name) && name !== '<unknown>') {
              diagnostics.push(
                makeDiagnostic('M003', 'error', filePath, loc(primaryDec).line, loc(primaryDec).column, {
                  name,
                }),
              );
            } else if (name === '<unknown>') {
              diagnostics.push(
                makeDiagnostic('M003', 'error', filePath, loc(primaryDec).line, loc(primaryDec).column, {
                  name: bodyText(primaryDec.expression),
                }),
              );
            }
          }

          const deps = inferDependencies(member.body, stateNames, getterNamesSet);

          methods.push({
            name: keyName,
            kind: methodKind,
            body: bodyText(member.body),
            async: member.async,
            dependencies: deps,
            location: loc(member),
          });
          continue;
        }
      }
    }

    // M006: Component must have render()
    if (kind === 'component' && render === undefined) {
      diagnostics.push(
        makeDiagnostic('M006', 'error', filePath, loc(classNode).line, loc(classNode).column),
      );
    }

    // M007: Primitive must have resolve()
    if (kind === 'primitive' && resolve === undefined) {
      diagnostics.push(
        makeDiagnostic('M007', 'error', filePath, loc(classNode).line, loc(classNode).column),
      );
    }

    const decl: MeridianDeclarationIR = {
      name: className,
      kind,
      exportDefault: isExportDefault,
      fields,
      getters,
      methods,
      ...(propsType !== undefined ? { propsType } : {}),
      ...(render !== undefined ? { render } : {}),
      ...(resolve !== undefined ? { resolve } : {}),
      ...(constructor !== undefined ? { constructor } : {}),
    };

    declarations.push(decl);
  }

  // -------------------------------------------------------------------------
  // M001: 'use client' required when Meridian declarations exist
  // -------------------------------------------------------------------------
  if (!clientDirective && declarations.length > 0) {
    // Emit at line 1, column 0
    diagnostics.push(makeDiagnostic('M001', 'error', filePath, 1, 0));
  }

  return {
    sourceFile: filePath,
    clientDirective,
    imports,
    declarations,
    diagnostics,
  };
}
