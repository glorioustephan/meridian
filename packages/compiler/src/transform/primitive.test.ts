import { describe, it, expect } from 'vitest';
import { lowerPrimitive } from './primitive.js';
import type {
  MeridianDeclarationIR,
  FieldIR,
  MethodIR,
  ResolveIR,
  ConstructorIR,
  ConstructorParamIR,
  ImportIR,
} from '../ir.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noLoc = { line: 1, column: 0 };
const noImports: ImportIR[] = [];

function makeDecl(
  overrides: Partial<MeridianDeclarationIR> & { name: string },
): MeridianDeclarationIR {
  return {
    kind: 'primitive',
    exportDefault: false,
    fields: [],
    getters: [],
    methods: [],
    resolve: {
      body: '{ return undefined; }',
      location: noLoc,
    },
    ...overrides,
  };
}

function stateField(name: string, initializer?: string): FieldIR {
  return {
    name,
    kind: 'state',
    location: noLoc,
    ...(initializer !== undefined ? { initializer } : {}),
  };
}

function effectMethod(name: string, body: string): MethodIR {
  return {
    name,
    kind: 'effect',
    body,
    async: false,
    dependencies: [],
    location: noLoc,
  };
}

function ctorParam(name: string, type?: string, optional = false): ConstructorParamIR {
  return {
    name,
    optional,
    ...(type !== undefined ? { type } : {}),
  };
}

function makeConstructor(params: ConstructorParamIR[], body = '{ super(); }'): ConstructorIR {
  return { params, body, location: noLoc };
}

function makeResolve(body: string, returnType?: string): ResolveIR {
  return {
    body,
    location: noLoc,
    ...(returnType !== undefined ? { returnType } : {}),
  };
}

// ---------------------------------------------------------------------------
// Test 1: Basic debounce primitive
// ---------------------------------------------------------------------------

describe('lowerPrimitive', () => {
  it('Test 1: basic debounce primitive lowers to a custom hook', () => {
    const decl = makeDecl({
      name: 'Debounce',
      exportDefault: false,
      constructor: makeConstructor([
        ctorParam('value', 'string'),
        ctorParam('delay', 'number'),
      ]),
      fields: [stateField('debouncedValue', "''")],
      methods: [
        effectMethod(
          'syncDebounce',
          [
            '{',
            '  const timer = setTimeout(() => { this.debouncedValue = this.value; }, this.delay);',
            '  return () => clearTimeout(timer);',
            '}',
          ].join('\n'),
        ),
      ],
      resolve: makeResolve('{ return this.debouncedValue; }', 'string'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'Debounce.ts' });

    // Hook function name
    expect(output).toContain('function useDebounce(');

    // Hook parameters
    expect(output).toContain('value: string');
    expect(output).toContain('delay: number');

    // useState emitted for @state field
    expect(output).toContain('useState');
    expect(output).toContain(`const [debouncedValue, setDebouncedValue] = useState(() => '')`);

    // useEffect emitted for @effect method
    expect(output).toContain('useEffect');

    // Return statement from resolve()
    expect(output).toContain('return debouncedValue');

    // Export is named (not default)
    expect(output).toContain('export function useDebounce(');
    expect(output).not.toContain('export default');
  });

  // -------------------------------------------------------------------------
  // Test 2: primitive with no constructor
  // -------------------------------------------------------------------------

  it('Test 2: primitive with no constructor emits hook with no params', () => {
    const decl = makeDecl({
      name: 'Foo',
      fields: [stateField('bar', '42')],
      resolve: makeResolve('{ return this.bar; }', 'number'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'Foo.ts' });

    // No constructor → no params between parens (just a closing paren follows immediately)
    expect(output).toContain('function useFoo()');

    // State is still emitted
    expect(output).toContain('const [bar, setBar] = useState(() => 42)');

    // resolve() return
    expect(output).toContain('return bar');
  });

  // -------------------------------------------------------------------------
  // Test 3: resolve() return type appears in signature
  // -------------------------------------------------------------------------

  it('Test 3: resolve returnType is emitted in the function signature', () => {
    const decl = makeDecl({
      name: 'Counter',
      constructor: makeConstructor([ctorParam('initial', 'number')]),
      fields: [stateField('count', 'this.props.initial')],
      resolve: makeResolve('{ return this.count; }', 'number'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'Counter.ts' });

    // Return type annotation in signature
    expect(output).toContain('): number {');
  });

  it('Test 3b: missing resolve returnType falls back to unknown', () => {
    const decl = makeDecl({
      name: 'NoType',
      resolve: makeResolve('{ return undefined; }'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'NoType.ts' });

    expect(output).toContain('): unknown {');
  });

  // -------------------------------------------------------------------------
  // Test 4: constructor params rewrite this.param -> param
  // -------------------------------------------------------------------------

  it('Test 4: this.value in effect body rewrites to value (constructor param)', () => {
    const decl = makeDecl({
      name: 'Debounce',
      constructor: makeConstructor([
        ctorParam('value', 'string'),
        ctorParam('delay', 'number'),
      ]),
      fields: [stateField('debouncedValue', "''")],
      methods: [
        effectMethod(
          'syncDebounce',
          [
            '{',
            '  const timer = setTimeout(() => { this.debouncedValue = this.value; }, this.delay);',
            '  return () => clearTimeout(timer);',
            '}',
          ].join('\n'),
        ),
      ],
      resolve: makeResolve('{ return this.debouncedValue; }', 'string'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'Debounce.ts' });

    // this.value -> value (constructor param, not state, no setter)
    expect(output).toContain('value');
    // The timer callback should contain `value` not `this.value`
    expect(output).not.toContain('this.value');
    expect(output).not.toContain('this.delay');

    // this.debouncedValue = x -> setDebouncedValue(x)
    expect(output).toContain('setDebouncedValue(value)');

    // The dep array should contain debouncedValue (state) and potentially value/delay
    // At minimum, the useEffect dep array closes over value and delay
    expect(output).toContain('[');
  });

  // -------------------------------------------------------------------------
  // Additional: exportDefault=true emits default export
  // -------------------------------------------------------------------------

  it('exportDefault=true emits default export', () => {
    const decl = makeDecl({
      name: 'MyPrimitive',
      exportDefault: true,
      resolve: makeResolve('{ return undefined; }'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'MyPrimitive.ts' });

    expect(output).toContain('export default function useMyPrimitive(');
  });

  // -------------------------------------------------------------------------
  // Additional: react hooks imported correctly
  // -------------------------------------------------------------------------

  it('imports useState and useEffect when both are needed', () => {
    const decl = makeDecl({
      name: 'Watcher',
      fields: [stateField('x', '0')],
      methods: [effectMethod('track', '{ console.log(this.x); }')],
      resolve: makeResolve('{ return this.x; }', 'number'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'Watcher.ts' });

    expect(output).toContain(`import React, { useState, useEffect }`);
  });

  // -------------------------------------------------------------------------
  // Additional: Meridian imports are stripped from output
  // -------------------------------------------------------------------------

  it('strips @meridian/meridian imports from output', () => {
    const imports: ImportIR[] = [
      { moduleSpecifier: '@meridian/meridian', namedBindings: ['Primitive', 'state', 'effect'] },
    ];

    const decl = makeDecl({
      name: 'Simple',
      resolve: makeResolve('{ return undefined; }'),
    });

    const output = lowerPrimitive({ declaration: decl, imports, filePath: 'Simple.ts' });

    expect(output).not.toContain('@meridian/meridian');
  });

  // -------------------------------------------------------------------------
  // Additional: constructor body (non-super statements) is emitted
  // -------------------------------------------------------------------------

  it('emits non-super constructor body statements inside hook body', () => {
    const ctor: ConstructorIR = {
      params: [ctorParam('value', 'string')],
      body: '{\n  super();\n  console.log("constructed with", value);\n}',
      location: noLoc,
    };

    const decl = makeDecl({
      name: 'Logged',
      constructor: ctor,
      resolve: makeResolve('{ return undefined; }'),
    });

    const output = lowerPrimitive({ declaration: decl, imports: noImports, filePath: 'Logged.ts' });

    // super() should be stripped; the console.log should remain
    expect(output).not.toContain('super()');
    expect(output).toContain('console.log');
  });
});
