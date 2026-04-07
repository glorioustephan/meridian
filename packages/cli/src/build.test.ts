import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from './build.js';
import { resolveConfig } from './config.js';

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-cli-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'src'), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('build', () => {
  it('compiles only Meridian source files from the configured source subtree', async () => {
    const cwd = makeTempProject();

    writeFileSync(
      join(cwd, 'src', 'Counter.meridian.tsx'),
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
      'utf8',
    );

    writeFileSync(join(cwd, 'src', 'plain.ts'), 'export const value = 1;\n', 'utf8');
    mkdirSync(join(cwd, 'src', 'node_modules'), { recursive: true });
    writeFileSync(
      join(cwd, 'src', 'node_modules', 'Ignored.tsx'),
      `
'use client';
import { Component } from 'meridian';
export default class Ignored extends Component { render() { return null; } }
`,
      'utf8',
    );

    const config = resolveConfig({ cwd });
    const result = await build(config);
    const outputFile = join(cwd, '.meridian/generated', 'Counter.meridian.tsx');

    expect(result).toEqual({
      compiled: 1,
      copied: 0,
      removed: 0,
      errors: 0,
      warnings: 0,
    });
    expect(existsSync(outputFile)).toBe(true);
    expect(readFileSync(outputFile, 'utf8')).toContain('useState');
    expect(existsSync(join(cwd, '.meridian/generated', 'plain.ts'))).toBe(false);
    expect(existsSync(join(cwd, '.meridian/generated', 'node_modules', 'Ignored.tsx'))).toBe(false);
  });

  it('surfaces compiler diagnostics as build errors', async () => {
    const cwd = makeTempProject();

    writeFileSync(
      join(cwd, 'src', 'Broken.meridian.tsx'),
      `
import { Component } from 'meridian';

export default class Broken extends Component {
  render() {
    return null;
  }
}
`,
      'utf8',
    );

    const result = await build(resolveConfig({ cwd }));

    expect(result.compiled).toBe(0);
    expect(result.errors).toBeGreaterThan(0);
    expect(existsSync(join(cwd, '.meridian/generated', 'Broken.meridian.tsx'))).toBe(false);
  });

  it('copies passthrough assets only when copyFiles is enabled', async () => {
    const cwd = makeTempProject();
    mkdirSync(join(cwd, 'src', 'assets'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'assets', 'logo.svg'), '<svg />\n', 'utf8');

    const result = await build(resolveConfig({ cwd, copyFiles: true }));
    const copiedAsset = join(cwd, '.meridian/generated', 'assets', 'logo.svg');

    expect(result.copied).toBe(1);
    expect(result.removed).toBe(0);
    expect(existsSync(copiedAsset)).toBe(true);
    expect(readFileSync(copiedAsset, 'utf8')).toContain('<svg />');
  });
});
