import { describe, it, expect } from 'vitest';
import { parseModule } from './index.js';

describe('parseModule', () => {
  it('Test 1: valid Component module with use client', () => {
    const src = `
'use client';
import { Component, state, effect } from '@meridian/meridian';
import type React from 'react';

export default class Counter extends Component<{ initial: number }> {
  @state count = 0;

  get doubled() { return this.count * 2; }

  @effect
  watchCount() { console.log(this.count); }

  render() { return <div>{this.count}</div>; }
}
`;

    const result = parseModule(src, 'Counter.tsx');

    expect(result.clientDirective).toBe(true);
    expect(result.declarations).toHaveLength(1);

    const decl = result.declarations[0];
    expect(decl).toBeDefined();
    if (!decl) throw new Error('no declaration');

    expect(decl.name).toBe('Counter');
    expect(decl.kind).toBe('component');
    expect(decl.exportDefault).toBe(true);

    // One @state field: count
    expect(decl.fields).toHaveLength(1);
    expect(decl.fields[0]?.name).toBe('count');
    expect(decl.fields[0]?.kind).toBe('state');

    // One getter: doubled
    expect(decl.getters).toHaveLength(1);
    expect(decl.getters[0]?.name).toBe('doubled');

    // One effect method: watchCount
    expect(decl.methods).toHaveLength(1);
    expect(decl.methods[0]?.name).toBe('watchCount');
    expect(decl.methods[0]?.kind).toBe('effect');

    // render is present
    expect(decl.render).toBeDefined();

    // No diagnostics
    expect(result.diagnostics).toHaveLength(0);
  });

  it('Test 2: missing use client emits M001', () => {
    const src = `
import { Component } from '@meridian/meridian';
export class Foo extends Component { render() { return null; } }
`;

    const result = parseModule(src, 'Foo.ts');

    expect(result.diagnostics.some((d) => d.code === 'M001')).toBe(true);
  });

  it('Test 3: missing render() emits M006', () => {
    const src = `
'use client';
import { Component } from '@meridian/meridian';
export class Foo extends Component { }
`;

    const result = parseModule(src, 'Foo.ts');

    expect(result.diagnostics.some((d) => d.code === 'M006')).toBe(true);
  });

  it('Test 4: missing resolve() on Primitive emits M007', () => {
    const src = `
'use client';
import { Primitive } from '@meridian/meridian';
export class Debounce extends Primitive<string> { }
`;

    const result = parseModule(src, 'Debounce.ts');

    expect(result.diagnostics.some((d) => d.code === 'M007')).toBe(true);
  });

  it('Test 5: unsupported decorator emits M003', () => {
    const src = `
'use client';
import { Component } from '@meridian/meridian';
export class Foo extends Component {
  @observable value = 0;
  render() { return null; }
}
`;

    const result = parseModule(src, 'Foo.ts');

    expect(result.diagnostics.some((d) => d.code === 'M003')).toBe(true);
  });

  it('correctly classifies Primitive declarations', () => {
    const src = `
'use client';
import { Primitive } from '@meridian/meridian';
export class Debounce extends Primitive<string> {
  resolve() { return 'hello'; }
}
`;

    const result = parseModule(src, 'Debounce.ts');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.declarations[0]?.kind).toBe('primitive');
    expect(result.declarations[0]?.resolve).toBeDefined();
  });

  it('collects imports correctly', () => {
    const src = `
'use client';
import { Component, state } from '@meridian/meridian';
import React, { useState } from 'react';
export class Foo extends Component { render() { return null; } }
`;

    const result = parseModule(src, 'Foo.ts');

    const meridianImport = result.imports.find((i) => i.moduleSpecifier === '@meridian/meridian');
    expect(meridianImport).toBeDefined();
    expect(meridianImport?.namedBindings).toContain('Component');
    expect(meridianImport?.namedBindings).toContain('state');

    const reactImport = result.imports.find((i) => i.moduleSpecifier === 'react');
    expect(reactImport?.defaultBinding).toBe('React');
    expect(reactImport?.namedBindings).toContain('useState');
  });

  it('infers state dependencies in getters and methods', () => {
    const src = `
'use client';
import { Component, state } from '@meridian/meridian';
export default class Counter extends Component {
  @state count = 0;
  get doubled() { return this.count * 2; }
  render() { return null; }
}
`;

    const result = parseModule(src, 'Counter.ts');

    const decl = result.declarations[0];
    expect(decl).toBeDefined();
    if (!decl) throw new Error('no declaration');

    const doubled = decl.getters.find((g) => g.name === 'doubled');
    expect(doubled).toBeDefined();
    expect(doubled?.dependencies.some((d) => d.source === 'state' && d.name === 'count')).toBe(true);
  });

  it('extracts @effect.layout decorator correctly', () => {
    const src = `
'use client';
import { Component, state } from '@meridian/meridian';
export default class Foo extends Component {
  @state x = 0;
  @effect.layout
  onMount() { console.log('mounted'); }
  render() { return null; }
}
`;

    const result = parseModule(src, 'Foo.ts');

    expect(result.diagnostics).toHaveLength(0);
    const onMount = result.declarations[0]?.methods.find((m) => m.name === 'onMount');
    expect(onMount?.kind).toBe('layoutEffect');
  });

  it('extracts @use decorator with primitive name and factory', () => {
    const src = `
'use client';
import { Component, use } from '@meridian/meridian';
export default class Foo extends Component {
  @use(Debounce, () => [300])
  debounced;
  render() { return null; }
}
`;

    const result = parseModule(src, 'Foo.ts');

    expect(result.diagnostics).toHaveLength(0);
    const field = result.declarations[0]?.fields.find((f) => f.name === 'debounced');
    expect(field?.kind).toBe('use');
    expect(field?.useTarget?.primitiveName).toBe('Debounce');
    expect(field?.useTarget?.argsFactoryBody).toContain('300');
  });

  it('M004: ServerComponent emits diagnostic', () => {
    const src = `
'use client';
import { Component } from '@meridian/meridian';
export class ServerComponent extends Component {
  render() { return null; }
}
`;

    const result = parseModule(src, 'Server.ts');

    expect(result.diagnostics.some((d) => d.code === 'M004')).toBe(true);
  });

  it('extracts constructor params', () => {
    const src = `
'use client';
import { Component } from '@meridian/meridian';
export default class Foo extends Component {
  constructor(private name: string, public age?: number) {
    super();
  }
  render() { return null; }
}
`;

    const result = parseModule(src, 'Foo.ts');

    expect(result.diagnostics).toHaveLength(0);
    const ctor = result.declarations[0]?.constructor;
    expect(ctor).toBeDefined();
    expect(ctor?.params).toHaveLength(2);
  });
});
