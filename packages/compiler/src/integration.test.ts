import { describe, expect, it } from 'vitest';
import { compileModule } from './index.js';

describe('compileModule', () => {
  it('compiles a component with state, getters, methods, and effects', () => {
    const result = compileModule(
      `
'use client';
import { Component, state, effect } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  get doubled() {
    return this.count * 2;
  }

  increment(step: number): void {
    this.count = this.count + step;
  }

  @effect
  logCount() {
    console.log(this.count);
  }

  render() {
    return <button onClick={() => this.increment(1)}>{this.doubled}</button>;
  }
}
`,
      'Counter.meridian.tsx',
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.output).toBeDefined();

    const output = result.output!;
    expect(output).toContain(`import React, { useState, useEffect } from 'react';`);
    expect(output).toContain('const [count, setCount] = useState(() => props.initial);');
    expect(output).toContain('const doubled = (() => {');
    expect(output).toContain('function increment(step: number): void {');
    expect(output).toContain('setCount(count + step);');
    expect(output).toContain('useEffect(() => {');
    expect(output).toContain('console.log(count);');
    expect(output).toContain('}, [count]);');
    expect(output).toContain(`onClick={() => increment(1)}`);
    expect(output).not.toContain(`from 'meridian'`);
  });

  it('compiles a primitive and rewires @use to a generated custom hook', () => {
    const primitive = compileModule(
      `
'use client';
import { Primitive, state, effect } from 'meridian';

export class Debounce extends Primitive<string> {
  constructor(private value: string, private delay: number) {
    super();
  }

  @state debounced = this.value;

  @effect
  sync() {
    const timer = setTimeout(() => {
      this.debounced = this.value;
    }, this.delay);

    return () => clearTimeout(timer);
  }

  resolve(): string {
    return this.debounced;
  }
}
`,
      'Debounce.meridian.ts',
    );

    const component = compileModule(
      `
'use client';
import { Component, state, use } from 'meridian';
import { Debounce } from './Debounce';

export default class SearchBox extends Component {
  @state query = '';

  @use(Debounce, () => [this.query, 300])
  debounced!: string;

  render() {
    return <div>{this.debounced}</div>;
  }
}
`,
      'SearchBox.meridian.tsx',
    );

    expect(primitive.diagnostics).toEqual([]);
    expect(component.diagnostics).toEqual([]);
    expect(primitive.output).toContain('export function useDebounce(');
    expect(component.output).toContain(`import { useDebounce } from './Debounce';`);
    expect(component.output).toContain('const debounced = useDebounce(query, 300);');
  });

  it('rejects unresolved dynamic dependency access with M008', () => {
    const result = compileModule(
      `
'use client';
import { Component, state, effect } from 'meridian';

export default class DynamicDeps extends Component {
  @state count = 0;
  @state activeKey = 'count';

  @effect
  logMetric() {
    console.log(this[this.activeKey]);
  }

  render() {
    return null;
  }
}
`,
      'DynamicDeps.meridian.tsx',
    );

    expect(result.output).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M008')).toBe(true);
  });

  it('rejects decorated inheritance with M002', () => {
    const result = compileModule(
      `
'use client';
import { Component } from 'meridian';

class Base extends Component {
  render() {
    return null;
  }
}

export default class Child extends Base {
  render() {
    return null;
  }
}
`,
      'Inheritance.meridian.tsx',
    );

    expect(result.output).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M002')).toBe(true);
  });

  it('rejects reactive private-field usage with M010', () => {
    const result = compileModule(
      `
'use client';
import { Component } from 'meridian';

export default class PrivateReactive extends Component {
  #cache = 1;

  get cached() {
    return this.#cache;
  }

  render() {
    return <div>{this.cached}</div>;
  }
}
`,
      'PrivateReactive.meridian.tsx',
    );

    expect(result.output).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M010')).toBe(true);
  });

  it('rejects multiple Meridian declarations in one module with M009', () => {
    const result = compileModule(
      `
'use client';
import { Component } from 'meridian';

export class First extends Component {
  render() {
    return null;
  }
}

export class Second extends Component {
  render() {
    return null;
  }
}
`,
      'Multiple.meridian.tsx',
    );

    expect(result.output).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M009')).toBe(true);
  });
});
