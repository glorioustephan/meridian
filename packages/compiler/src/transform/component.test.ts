import { describe, it, expect } from 'vitest';
import { lowerComponent } from './component.js';
import type {
  MeridianDeclarationIR,
  FieldIR,
  GetterIR,
  MethodIR,
  ImportIR,
} from '../ir.js';

// ---------------------------------------------------------------------------
// Helpers for building minimal IR fixtures
// ---------------------------------------------------------------------------

const noLoc = { line: 1, column: 0 };

function makeDecl(
  overrides: Partial<MeridianDeclarationIR> & { name: string },
): MeridianDeclarationIR {
  return {
    kind: 'component',
    exportDefault: true,
    fields: [],
    getters: [],
    methods: [],
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

function refField(name: string): FieldIR {
  return { name, kind: 'ref', location: noLoc };
}

function getter(name: string, body: string): GetterIR {
  return { name, body, dependencies: [], location: noLoc };
}

function method(name: string, body: string, opts: { async?: boolean } = {}): MethodIR {
  return {
    name,
    kind: 'method',
    body,
    async: opts.async ?? false,
    dependencies: [],
    location: noLoc,
  };
}

const noImports: ImportIR[] = [];

// ---------------------------------------------------------------------------
// Test 1: Basic counter with @state
// ---------------------------------------------------------------------------

describe('lowerComponent', () => {
  it('Test 1: @state field emits useState with setter', () => {
    const decl = makeDecl({
      name: 'Counter',
      fields: [stateField('count', '0')],
      render: { body: '{ return <div>{this.count}</div>; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Counter.tsx' });

    // Header
    expect(output).toContain(`'use client';`);

    // useState import
    expect(output).toContain(`useState`);
    expect(output).toContain(`import React, { useState }`);

    // State declaration
    expect(output).toContain('const [count, setCount] = useState(() => 0)');

    // Render: this.count -> count
    expect(output).toContain('{count}');

    // Function signature
    expect(output).toContain('export default function Counter(');
  });

  it('Test 1b: @state field without initializer emits useState<unknown>(undefined)', () => {
    const decl = makeDecl({
      name: 'Widget',
      fields: [stateField('value')],
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Widget.tsx' });

    expect(output).toContain('const [value, setValue] = useState<unknown>(undefined)');
  });

  // -------------------------------------------------------------------------
  // Test 2: Getter emits derived const
  // -------------------------------------------------------------------------

  it('Test 2: getter emits const with IIFE', () => {
    const decl = makeDecl({
      name: 'Counter',
      fields: [stateField('count', '0')],
      getters: [getter('doubled', '{\n  return this.count * 2;\n}')],
      render: { body: '{ return <div>{this.doubled}</div>; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Counter.tsx' });

    // Getter lowered to const IIFE
    expect(output).toContain('const doubled = (() =>');

    // this.count -> count inside getter body
    expect(output).toContain('return count * 2');

    // this.doubled -> doubled in render
    expect(output).toContain('{doubled}');
  });

  // -------------------------------------------------------------------------
  // Test 3: @ref field emits useRef
  // -------------------------------------------------------------------------

  it('Test 3: @ref field emits useRef', () => {
    const decl = makeDecl({
      name: 'InputWrapper',
      fields: [refField('inputEl')],
      render: { body: '{ return <input ref={this.inputEl} />; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'InputWrapper.tsx' });

    // useRef import
    expect(output).toContain('useRef');
    expect(output).toContain(`import React, { useRef }`);

    // Ref declaration
    expect(output).toContain('const inputEl = useRef<unknown>(null)');

    // this.inputEl -> inputEl in render
    expect(output).toContain('ref={inputEl}');
  });

  // -------------------------------------------------------------------------
  // Test 4: Props access — this.props.bar -> props.bar
  // -------------------------------------------------------------------------

  it('Test 4: this.props.initial in render -> props.initial', () => {
    const decl = makeDecl({
      name: 'Display',
      propsType: '{ initial: number }',
      render: { body: '{ return <span>{this.props.initial}</span>; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Display.tsx' });

    // Props parameter typed correctly
    expect(output).toContain('props: { initial: number }');

    // this.props.initial -> props.initial
    expect(output).toContain('props.initial');
    expect(output).not.toContain('this.props');
  });

  it('Test 4b: undefined propsType falls back to Record<string, unknown>', () => {
    const decl = makeDecl({
      name: 'NoProps',
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'NoProps.tsx' });

    expect(output).toContain('props: Record<string, unknown>');
  });

  // -------------------------------------------------------------------------
  // Test 5: State mutation in method — this.count = 5 -> setCount(5)
  // -------------------------------------------------------------------------

  it('Test 5: this.count = 5 in a method -> setCount(5)', () => {
    const decl = makeDecl({
      name: 'Counter',
      fields: [stateField('count', '0')],
      methods: [
        method('handleClick', '{\n  this.count = 5;\n}'),
      ],
      render: { body: '{ return <button onClick={this.handleClick}>{this.count}</button>; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Counter.tsx' });

    // State mutation rewritten to setter call
    expect(output).toContain('setCount(5)');
    expect(output).not.toContain('this.count');

    // Method reference in render rewritten
    expect(output).toContain('onClick={handleClick}');

    // Method emitted as local function
    expect(output).toContain('function handleClick(');
  });

  // -------------------------------------------------------------------------
  // Additional: exportDefault=false uses named export
  // -------------------------------------------------------------------------

  it('exportDefault=false emits named export', () => {
    const decl = makeDecl({
      name: 'MyComponent',
      exportDefault: false,
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'MyComponent.tsx' });

    expect(output).toContain('export function MyComponent(');
    expect(output).not.toContain('export default');
  });

  // -------------------------------------------------------------------------
  // Additional: non-Meridian imports are preserved
  // -------------------------------------------------------------------------

  it('non-Meridian imports are preserved; Meridian imports are dropped', () => {
    const imports: ImportIR[] = [
      { moduleSpecifier: '@meridian/meridian', namedBindings: ['Component', 'state'] },
      { moduleSpecifier: 'lodash', namedBindings: ['debounce'], defaultBinding: undefined },
      { moduleSpecifier: './utils', defaultBinding: 'utils', namedBindings: [] },
    ];

    const decl = makeDecl({
      name: 'MyComp',
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports, filePath: 'MyComp.tsx' });

    // Meridian import dropped
    expect(output).not.toContain('@meridian/meridian');

    // lodash preserved
    expect(output).toContain(`from 'lodash'`);
    expect(output).toContain('debounce');

    // ./utils preserved
    expect(output).toContain(`from './utils'`);
    expect(output).toContain('utils');
  });

  // -------------------------------------------------------------------------
  // Additional: both useState and useRef emitted when both kinds present
  // -------------------------------------------------------------------------

  it('emits both useState and useRef when both kinds present', () => {
    const decl = makeDecl({
      name: 'Mixed',
      fields: [stateField('count', '0'), refField('el')],
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Mixed.tsx' });

    expect(output).toContain('import React, { useState, useRef }');
  });

  // -------------------------------------------------------------------------
  // Additional: compound state update in method (+=)
  // -------------------------------------------------------------------------

  it('this.count += 1 is left as-is (compound assignment not rewritten)', () => {
    // Per spec, only `=` assignments are rewritten; compound operators like +=
    // are left as-is to avoid incorrect transformations.
    const decl = makeDecl({
      name: 'Counter',
      fields: [stateField('count', '0')],
      methods: [method('increment', '{\n  this.count += 1;\n}')],
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Counter.tsx' });

    // The compound assignment should remain (count += 1 left as this.count += 1)
    expect(output).toContain('count += 1');
  });

  // -------------------------------------------------------------------------
  // Additional: async method
  // -------------------------------------------------------------------------

  it('async method emits async function', () => {
    const decl = makeDecl({
      name: 'Fetcher',
      methods: [method('load', '{\n  await fetch("/api");\n}', { async: true })],
      render: { body: '{ return null; }', location: noLoc },
    });

    const output = lowerComponent({ declaration: decl, imports: noImports, filePath: 'Fetcher.tsx' });

    expect(output).toContain('async function load(');
  });
});
