// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { StrictMode, type ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { compileModule } from '../compile.js';
import { compileAndLoadModules } from '../test-utils/runtime.js';

afterEach(() => {
  cleanup();
});

describe('compiled Meridian components under StrictMode', () => {
  it('owns state in hooks while honoring props-backed initializers', async () => {
    const runtime = await compileAndLoadModules<{ default: ComponentType<{ initial: number }> }>(
      [
        {
          filePath: 'Counter.tsx',
          source: `
'use client';
import { Component, state } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment(): void {
    this.count = this.count + 1;
  }

  render(): JSX.Element {
    return <button onClick={() => this.increment()}>Count: {this.count}</button>;
  }
}
`,
        },
      ],
      'Counter.tsx',
    );

    try {
      const Counter = runtime.module.default;
      const user = userEvent.setup();

      render(
        <StrictMode>
          <Counter initial={2} />
        </StrictMode>,
      );

      expect(screen.getByRole('button').textContent).toContain('Count: 2');

      await user.click(screen.getByRole('button'));

      expect(screen.getByRole('button').textContent).toContain('Count: 3');
    } finally {
      await runtime.cleanup();
    }
  });

  it('updates getter-backed render output after state changes', async () => {
    const runtime = await compileAndLoadModules<{ default: ComponentType<{ initial: number }> }>(
      [
        {
          filePath: 'DerivedCounter.tsx',
          source: `
'use client';
import { Component, state } from 'meridian';

export default class DerivedCounter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  get doubled(): number {
    return this.count * 2;
  }

  increment(): void {
    this.count = this.count + 1;
  }

  render(): JSX.Element {
    return (
      <button onClick={() => this.increment()}>
        Count: {this.count} / Double: {this.doubled}
      </button>
    );
  }
}
`,
        },
      ],
      'DerivedCounter.tsx',
    );

    try {
      const DerivedCounter = runtime.module.default;
      const user = userEvent.setup();

      render(
        <StrictMode>
          <DerivedCounter initial={2} />
        </StrictMode>,
      );

      expect(screen.getByRole('button').textContent).toContain('Count: 2 / Double: 4');

      await user.click(screen.getByRole('button'));

      expect(screen.getByRole('button').textContent).toContain('Count: 3 / Double: 6');
    } finally {
      await runtime.cleanup();
    }
  });

  it('preserves named method parameters in compiled event handlers', async () => {
    const runtime = await compileAndLoadModules<{ default: ComponentType<{ initial: number }> }>(
      [
        {
          filePath: 'Stepper.tsx',
          source: `
'use client';
import { Component, state } from 'meridian';

export default class Stepper extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment(step: number): void {
    this.count = this.count + step;
  }

  render(): JSX.Element {
    return <button onClick={() => this.increment(2)}>Count: {this.count}</button>;
  }
}
`,
        },
      ],
      'Stepper.tsx',
    );

    try {
      const Stepper = runtime.module.default;
      const user = userEvent.setup();

      render(
        <StrictMode>
          <Stepper initial={2} />
        </StrictMode>,
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByRole('button').textContent).toContain('Count: 4');
    } finally {
      await runtime.cleanup();
    }
  });

  it('does not synthesize a retained runtime instance in lowered output', () => {
    const result = compileModule(
      `
'use client';
import { Component, state } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment(): void {
    this.count = this.count + 1;
  }

  render(): JSX.Element {
    return <button onClick={() => this.increment()}>Count: {this.count}</button>;
  }
}
`,
      'Counter.tsx',
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.output).toBeDefined();

    const output = result.output!;
    expect(output).not.toContain('Proxy(');
    expect(output).not.toMatch(/\bnew\s+Counter\s*\(/u);
    expect(output).not.toContain('this.count');
    expect(output).not.toContain('this.increment');
    expect(output).not.toContain('this.props');
  });
});
