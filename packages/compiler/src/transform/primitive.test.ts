import { describe, expect, it } from 'vitest';
import { createModuleIR } from '../parser/index.js';
import { validateModule } from '../validate.js';
import { lowerPrimitive } from './primitive.js';

function lowerValidPrimitive(source: string, filePath = 'Primitive.ts'): string {
  const ir = createModuleIR(source, filePath);
  const diagnostics = validateModule(ir);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

  expect(errors).toEqual([]);

  const declaration = ir.declarations[0];
  expect(declaration?.kind).toBe('primitive');

  return lowerPrimitive({
    declaration: declaration!,
    imports: ir.imports,
    filePath,
  });
}

describe('lowerPrimitive', () => {
  it('lowers a primitive class to a custom hook with constructor params', () => {
    const output = lowerValidPrimitive(
      `
'use client';
import { Primitive, state, effect } from 'meridian';

export class Debounce extends Primitive<string> {
  constructor(private value: string, private delay: number) {
    super();
  }

  @state debouncedValue = this.value;

  @effect
  syncDebounce() {
    const timer = setTimeout(() => {
      this.debouncedValue = this.value;
    }, this.delay);

    return () => clearTimeout(timer);
  }

  resolve(): string {
    return this.debouncedValue;
  }
}
`,
      'Debounce.ts',
    );

    expect(output).toContain(`'use client';`);
    expect(output).toContain(`import React, { useState, useEffect } from 'react';`);
    expect(output).toContain('export function useDebounce(value: string, delay: number): string {');
    expect(output).toContain('const [debouncedValue, setDebouncedValue] = useState(() => value);');
    expect(output).toContain('setDebouncedValue(value);');
    expect(output).toContain('}, [value, delay]);');
    expect(output).toContain('return debouncedValue;');
    expect(output).not.toContain(`from 'meridian'`);
  });

  it('emits non-super constructor statements inside the hook body', () => {
    const output = lowerValidPrimitive(
      `
'use client';
import { Primitive, state } from 'meridian';

export class UseCounter extends Primitive<number> {
  constructor(private initial: number) {
    super();
    console.log(this.initial);
  }

  @state count = this.initial;

  resolve(): number {
    return this.count;
  }
}
`,
      'UseCounter.ts',
    );

    expect(output).toContain('console.log(initial);');
    expect(output).not.toContain('super();');
  });

  it('supports primitives without constructors', () => {
    const output = lowerValidPrimitive(
      `
'use client';
import { Primitive, state } from 'meridian';

export class UseFlag extends Primitive<boolean> {
  @state enabled = true;

  resolve(): boolean {
    return this.enabled;
  }
}
`,
      'UseFlag.ts',
    );

    expect(output).toContain('export function useFlag(): boolean {');
    expect(output).toContain('const [enabled, setEnabled] = useState(() => true);');
    expect(output).toContain('return enabled;');
  });
});
