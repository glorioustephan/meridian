import { describe, it, expect } from 'vitest';
import { compileModule } from '@meridian/compiler';

describe('compileModule integration', () => {
  it('compiles a valid counter component', () => {
    const src = `
'use client';
import { Component, state } from '@meridian/meridian';
export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;
  render() { return <div>{count}</div>; }
}
`;
    const result = compileModule(src, 'Counter.tsx');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.output).toContain('useState');
    expect(result.output).toContain("'use client'");
  });

  it('returns errors for missing use client', () => {
    const src = `
import { Component } from '@meridian/meridian';
export class Foo extends Component { render() { return null; } }
`;
    const result = compileModule(src, 'Foo.tsx');
    expect(result.diagnostics.some(d => d.code === 'M001')).toBe(true);
    expect(result.output).toBeUndefined();
  });

  it('compiles a primitive to a custom hook', () => {
    const src = `
'use client';
import { Primitive, state } from '@meridian/meridian';
export class Debounce extends Primitive<string> {
  constructor(private value: string, private delay: number) { super(); }
  @state debouncedValue = '';
  resolve() { return this.debouncedValue; }
}
`;
    const result = compileModule(src, 'Debounce.tsx');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.output).toContain('function useDebounce');
    expect(result.output).toContain('useState');
  });
});
