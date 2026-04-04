import { describe, expect, it } from 'vitest';
import { createModuleIR } from '../parser/index.js';
import { validateModule } from '../validate.js';
import { lowerComponent } from './component.js';

function lowerValidComponent(source: string, filePath = 'Component.tsx'): string {
  const ir = createModuleIR(source, filePath);
  const diagnostics = validateModule(ir);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

  expect(errors).toEqual([]);

  const declaration = ir.declarations[0];
  expect(declaration?.kind).toBe('component');

  return lowerComponent({
    declaration: declaration!,
    imports: ir.imports,
    filePath,
  });
}

describe('lowerComponent', () => {
  it('rewrites state initializers that reference props', () => {
    const output = lowerValidComponent(
      `
'use client';
import { Component, state } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  render() {
    return <div>{this.count}</div>;
  }
}
`,
      'Counter.tsx',
    );

    expect(output).toContain(`'use client';`);
    expect(output).toContain(`import React, { useState } from 'react';`);
    expect(output).toContain('const [count, setCount] = useState(() => props.initial);');
    expect(output).toContain('return <div>{count}</div>;');
    expect(output).not.toContain('this.props.initial');
  });

  it('preserves named method parameters and rewrites state assignments', () => {
    const output = lowerValidComponent(
      `
'use client';
import { Component, state } from 'meridian';

export default class Filters extends Component {
  @state active = 'all';

  applyFilter(filter: string): void {
    this.active = filter;
  }

  render() {
    return <button onClick={() => this.applyFilter('open')}>{this.active}</button>;
  }
}
`,
      'Filters.tsx',
    );

    expect(output).toContain('function applyFilter(filter: string): void {');
    expect(output).toContain('setActive(filter);');
    expect(output).toContain(`onClick={() => applyFilter('open')}`);
    expect(output).not.toContain('...args: unknown[]');
  });

  it('lowers refs and computed getters without raw Meridian imports', () => {
    const output = lowerValidComponent(
      `
'use client';
import { Component, ref, state } from 'meridian';

export default class InputWrapper extends Component {
  @ref inputEl!: HTMLInputElement;
  @state count = 1;

  get doubled() {
    return this.count * 2;
  }

  render() {
    return <input ref={this.inputEl} aria-label={String(this.doubled)} />;
  }
}
`,
      'InputWrapper.tsx',
    );

    expect(output).toContain(`import React, { useState, useRef } from 'react';`);
    expect(output).toContain('const inputEl = useRef<HTMLInputElement | null>(null);');
    expect(output).toContain('const doubled = (() => {');
    expect(output).toContain('return count * 2;');
    expect(output).toContain('ref={inputEl}');
    expect(output).not.toContain(`from 'meridian'`);
  });

  it('rewires @use fields to generated primitive hooks', () => {
    const output = lowerValidComponent(
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
      'SearchBox.tsx',
    );

    expect(output).toContain(`import { useDebounce } from './Debounce';`);
    expect(output).toContain('const debounced = useDebounce(query, 300);');
    expect(output).not.toContain('TODO');
  });
});
