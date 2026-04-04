import { describe, expect, it } from 'vitest';
import type * as t from '@babel/types';
import { parseTypeScriptModule } from '../ast.js';
import { analyzeDeps, flattenDeps, type ClassContext, type ResolvedDep } from './deps.js';

function parseBlock(body: string): t.BlockStatement {
  const ast = parseTypeScriptModule(`function scope() {${body}}`);
  const statement = ast.program.body[0];

  if (!statement || statement.type !== 'FunctionDeclaration') {
    throw new Error('failed to parse function body fixture');
  }

  return statement.body;
}

function parseClassMethodBody(body: string): t.BlockStatement {
  const ast = parseTypeScriptModule(`class Scope { #cache = 1; method() {${body}} }`);
  const statement = ast.program.body[0];

  if (!statement || statement.type !== 'ClassDeclaration') {
    throw new Error('failed to parse class body fixture');
  }

  const method = statement.body.body.find(
    (member): member is t.ClassMethod =>
      member.type === 'ClassMethod' && member.kind === 'method',
  );

  if (!method) {
    throw new Error('failed to parse class method fixture');
  }

  return method.body;
}

function makeContext(overrides: Partial<ClassContext> = {}): ClassContext {
  return {
    stateFields: new Set<string>(),
    getterNames: new Set<string>(),
    getterBodies: new Map<string, t.BlockStatement>(),
    ...overrides,
  };
}

describe('analyzeDeps', () => {
  it('captures state dependencies from direct this access', () => {
    const result = analyzeDeps(
      parseBlock('console.log(this.count);'),
      makeContext({ stateFields: new Set(['count']) }),
    );

    expect(result).toEqual({
      deps: [{ source: 'state', name: 'count' }],
      hasDynamicAccess: false,
      hasPrivateAccess: false,
    } satisfies {
      deps: ResolvedDep[];
      hasDynamicAccess: boolean;
      hasPrivateAccess: boolean;
    });
  });

  it('captures prop dependencies from this.props.foo', () => {
    const result = analyzeDeps(
      parseBlock('document.title = this.props.title;'),
      makeContext(),
    );

    expect(result.deps).toEqual<ResolvedDep[]>([{ source: 'prop', name: 'title' }]);
    expect(result.hasDynamicAccess).toBe(false);
  });

  it('treats bare this.props as an all-props dependency', () => {
    const result = analyzeDeps(parseBlock('console.log(this.props);'), makeContext());

    expect(result.deps).toEqual<ResolvedDep[]>([{ source: 'prop', name: '__all__' }]);
  });

  it('flattens getter dependencies to concrete state deps', () => {
    const ctx = makeContext({
      stateFields: new Set(['count']),
      getterNames: new Set(['doubled']),
      getterBodies: new Map([['doubled', parseBlock('return this.count * 2;')]]),
    });

    const analyzed = analyzeDeps(parseBlock('console.log(this.doubled);'), ctx);
    expect(analyzed.deps).toEqual<ResolvedDep[]>([{ source: 'getter', name: 'doubled' }]);

    const flattened = flattenDeps(analyzed.deps, ctx);
    expect(flattened).toEqual({
      deps: [{ source: 'state', name: 'count' }],
      hasCycle: false,
    });
  });

  it('flags dynamic reactive access patterns', () => {
    const dynamicCases = [
      'console.log(this[someKey]);',
      'for (const key in this) { console.log(key); }',
      'Object.keys(this);',
      'Object.values(this);',
      'Object.entries(this);',
    ];

    for (const body of dynamicCases) {
      const result = analyzeDeps(parseBlock(body), makeContext());
      expect(result.hasDynamicAccess, body).toBe(true);
    }
  });

  it('flags private-field access in reactive bodies', () => {
    const result = analyzeDeps(parseClassMethodBody('return this.#cache;'), makeContext());
    expect(result.hasPrivateAccess).toBe(true);
  });

  it('deduplicates repeated direct dependencies', () => {
    const result = analyzeDeps(
      parseBlock('console.log(this.count); console.log(this.count + 1); return this.count;'),
      makeContext({ stateFields: new Set(['count']) }),
    );

    expect(result.deps).toEqual<ResolvedDep[]>([{ source: 'state', name: 'count' }]);
  });

  it('detects getter cycles without recursing forever', () => {
    const ctx = makeContext({
      getterNames: new Set(['a', 'b']),
      getterBodies: new Map([
        ['a', parseBlock('return this.b;')],
        ['b', parseBlock('return this.a;')],
      ]),
    });

    const analyzed = analyzeDeps(parseBlock('return this.a;'), ctx);
    const flattened = flattenDeps(analyzed.deps, ctx);

    expect(flattened).toEqual({ deps: [], hasCycle: true });
  });

  it('deduplicates concrete deps across getter expansion', () => {
    const ctx = makeContext({
      stateFields: new Set(['count']),
      getterNames: new Set(['a', 'b']),
      getterBodies: new Map([
        ['a', parseBlock('return this.count;')],
        ['b', parseBlock('return this.count * 2;')],
      ]),
    });

    const flattened = flattenDeps(
      [
        { source: 'getter', name: 'a' },
        { source: 'getter', name: 'b' },
      ],
      ctx,
    );

    expect(flattened).toEqual({
      deps: [{ source: 'state', name: 'count' }],
      hasCycle: false,
    });
  });
});
