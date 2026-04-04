import { describe, expect, it } from 'vitest';
import { parseModule } from './index.js';

describe('parseModule', () => {
  it('parses a valid component and resolves dependencies', () => {
    const result = parseModule(
      `
'use client';
import { Component, state, effect } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  get doubled() {
    return this.count * 2;
  }

  @effect.layout
  syncLayout(): void {
    console.log(this.props.initial, this.count);
  }

  render() {
    return <div>{this.doubled}</div>;
  }
}
`,
      'Counter.tsx',
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.clientDirective).toBe(true);
    expect(result.declarations).toHaveLength(1);

    const declaration = result.declarations[0];
    expect(declaration?.name).toBe('Counter');
    expect(declaration?.kind).toBe('component');
    expect(declaration?.propsType).toContain('initial: number');
    expect(declaration?.fields[0]?.name).toBe('count');
    expect(declaration?.fields[0]?.initializerText).toBe('this.props.initial');
    expect(declaration?.getters[0]?.dependencies).toEqual([{ source: 'state', name: 'count' }]);
    expect(declaration?.methods[0]?.kind).toBe('layoutEffect');
    expect(declaration?.methods[0]?.dependencies).toEqual([
      { source: 'prop', name: 'initial' },
      { source: 'state', name: 'count' },
    ]);

    const meridianImport = result.imports.find((entry) => entry.moduleSpecifier === 'meridian');
    expect(meridianImport?.namedBindings).toEqual([
      { imported: 'Component', local: 'Component' },
      { imported: 'state', local: 'state' },
      { imported: 'effect', local: 'effect' },
    ]);
  });

  it('extracts constructor params and valid @use linkage', () => {
    const result = parseModule(
      `
'use client';
import { Component, use } from 'meridian';
import { Debounce } from './Debounce';

export default class SearchBox extends Component<{ query: string }> {
  constructor(private label: string, public delay?: number) {
    super();
  }

  @use(Debounce, () => [this.props.query, this.delay ?? 300])
  debounced!: string;

  render() {
    return <div>{this.debounced}</div>;
  }
}
`,
      'SearchBox.tsx',
    );

    expect(result.diagnostics).toHaveLength(0);

    const declaration = result.declarations[0];
    expect(declaration?.ctor?.params.map((param) => param.name)).toEqual(['label', 'delay']);
    expect(declaration?.fields[0]?.kind).toBe('use');
    expect(declaration?.fields[0]?.useTarget?.primitiveName).toBe('Debounce');
    expect(declaration?.fields[0]?.useTarget?.importSource).toBe('./Debounce');
  });

  it('emits M001 when a Meridian module omits use client', () => {
    const result = parseModule(
      `
import { Component } from 'meridian';

export class Foo extends Component {
  render() {
    return null;
  }
}
`,
      'Foo.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M001')).toBe(true);
  });

  it('emits M002 for decorated inheritance through a local base class', () => {
    const result = parseModule(
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
      'Inheritance.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M002')).toBe(true);
  });

  it('emits M003 for unsupported decorators', () => {
    const result = parseModule(
      `
'use client';
import { Component } from 'meridian';

export default class Foo extends Component {
  @observable value = 0;

  render() {
    return null;
  }
}
`,
      'Foo.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M003')).toBe(true);
  });

  it('emits M004 for first-class server component authoring', () => {
    const result = parseModule(
      `
'use client';
import { ServerComponent } from 'meridian';

export default class ProductPage extends ServerComponent {
  resolve() {
    return null;
  }
}
`,
      'ServerComponent.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M004')).toBe(true);
  });

  it('emits M006 and M007 when required lifecycle entrypoints are missing', () => {
    const componentResult = parseModule(
      `
'use client';
import { Component } from 'meridian';

export class Foo extends Component {}
`,
      'Foo.tsx',
    );

    const primitiveResult = parseModule(
      `
'use client';
import { Primitive } from 'meridian';

export class UseThing extends Primitive<string> {}
`,
      'UseThing.ts',
    );

    expect(componentResult.diagnostics.some((diagnostic) => diagnostic.code === 'M006')).toBe(true);
    expect(primitiveResult.diagnostics.some((diagnostic) => diagnostic.code === 'M007')).toBe(true);
  });

  it('emits M008 for dynamic dependency access', () => {
    const result = parseModule(
      `
'use client';
import { Component, state, effect } from 'meridian';

export default class Foo extends Component {
  @state count = 0;
  @state key = 'count';

  @effect
  watch() {
    console.log(this[this.key]);
  }

  render() {
    return null;
  }
}
`,
      'DynamicDeps.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M008')).toBe(true);
  });

  it('emits M009 when a module contains multiple Meridian declarations', () => {
    const result = parseModule(
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
      'Multi.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M009')).toBe(true);
  });

  it('emits M010 for reactive private-field usage', () => {
    const result = parseModule(
      `
'use client';
import { Component } from 'meridian';

export default class Foo extends Component {
  #cache = 1;

  get cached() {
    return this.#cache;
  }

  render() {
    return <div>{this.cached}</div>;
  }
}
`,
      'PrivateReactive.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M010')).toBe(true);
  });

  it('emits M011 for unsupported @use argument factories', () => {
    const result = parseModule(
      `
'use client';
import { Component, use } from 'meridian';
import { Debounce } from './Debounce';

export default class Foo extends Component {
  @use(Debounce, makeArgs())
  debounced!: string;

  render() {
    return null;
  }
}
`,
      'UnsupportedUse.tsx',
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'M011')).toBe(true);
  });
});
