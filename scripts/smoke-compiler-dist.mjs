import { compileModule } from '../packages/compiler/dist/index.js';

const source = `'use client';
import { Component, state } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment(step: number): void {
    this.count = this.count + step;
  }

  render() {
    return <button onClick={() => this.increment(1)}>{this.count}</button>;
  }
}
`;

const result = compileModule(source, 'Counter.meridian.tsx');

if (!result.output) {
  console.error('compiler smoke test failed: no output emitted');
  console.error(JSON.stringify(result.diagnostics, null, 2));
  process.exit(1);
}

const requiredSnippets = [
  `import React, { useState } from 'react';`,
  'const [count, setCount] = useState(() => props.initial);',
  'function increment(step: number): void {',
  'setCount(count + step);',
];

for (const snippet of requiredSnippets) {
  if (!result.output.includes(snippet)) {
    console.error(`compiler smoke test failed: missing snippet ${JSON.stringify(snippet)}`);
    console.error(result.output);
    process.exit(1);
  }
}

if (result.output.includes('this.count') || result.output.includes('this.increment')) {
  console.error('compiler smoke test failed: leaked class instance references');
  console.error(result.output);
  process.exit(1);
}

console.log('compiler smoke test passed');
