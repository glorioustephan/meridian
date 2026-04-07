import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build, buildFile, removeOutputForSource } from './build.js';
import { resolveConfig } from './config.js';
import { createWatchController, type FSWatcherLike, type WatchControllerDeps } from './watch.js';

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-watch-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'src'), { recursive: true });
  return dir;
}

function validCounterSource(label = 'Count'): string {
  return `
'use client';
import { Component, state } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment(): void {
    this.count = this.count + 1;
  }

  render() {
    return <button onClick={() => this.increment()}>${label}: {this.count}</button>;
  }
}
`;
}

function createNoopWatcher(): FSWatcherLike {
  return {
    close() {
      return;
    },
  };
}

function createTestDeps(
  overrides: Partial<WatchControllerDeps> = {},
): WatchControllerDeps {
  return {
    buildAll: async (config) => build(config),
    buildFile,
    removeOutputForSource,
    logBuildResult: () => undefined,
    log: () => undefined,
    watch: () => createNoopWatcher(),
    setTimeout: (callback, delayMs) => setTimeout(() => void callback(), delayMs),
    clearTimeout,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('createWatchController', () => {
  it('runs one initial build when watch mode starts', async () => {
    const cwd = makeTempProject();
    writeFileSync(join(cwd, 'src', 'Counter.meridian.tsx'), validCounterSource(), 'utf8');

    const config = resolveConfig({ cwd });
    const buildAll = vi.fn(async (currentConfig) => build(currentConfig));
    const controller = createWatchController(config, createTestDeps({ buildAll }));

    await controller.start();

    expect(buildAll).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cwd, '.meridian/generated', 'Counter.meridian.tsx'))).toBe(true);

    controller.close();
  });

  it('rebuilds only the changed Meridian source file in the common case', async () => {
    const cwd = makeTempProject();
    writeFileSync(join(cwd, 'src', 'Counter.meridian.tsx'), validCounterSource('Count'), 'utf8');
    writeFileSync(join(cwd, 'src', 'Other.meridian.tsx'), validCounterSource('Other'), 'utf8');

    const config = resolveConfig({ cwd });
    const buildOne = vi.fn((filePath: string, currentConfig) => buildFile(filePath, currentConfig));
    const buildAll = vi.fn(async (currentConfig) => build(currentConfig));
    const controller = createWatchController(
      config,
      createTestDeps({
        buildAll,
        buildFile: buildOne,
      }),
    );

    await controller.start();

    const counterOut = join(cwd, '.meridian/generated', 'Counter.meridian.tsx');
    const otherOut = join(cwd, '.meridian/generated', 'Other.meridian.tsx');
    const otherMtimeBefore = statSync(otherOut).mtimeMs;

    writeFileSync(join(cwd, 'src', 'Counter.meridian.tsx'), validCounterSource('Updated'), 'utf8');
    controller.handleFsEvent('change', 'Counter.meridian.tsx');
    await vi.advanceTimersByTimeAsync(80);

    expect(buildAll).toHaveBeenCalledTimes(1);
    expect(buildOne).toHaveBeenCalledTimes(1);
    expect(buildOne).toHaveBeenCalledWith(join(cwd, 'src', 'Counter.meridian.tsx'), config);
    expect(readFileSync(counterOut, 'utf8')).toContain('Updated: {count}');
    expect(statSync(otherOut).mtimeMs).toBe(otherMtimeBefore);

    controller.close();
  });

  it('ignores changes under the generated output directory', async () => {
    const cwd = makeTempProject();
    writeFileSync(join(cwd, 'src', 'Counter.meridian.tsx'), validCounterSource(), 'utf8');

    const config = resolveConfig({
      cwd,
      outDir: join(cwd, 'src', '.meridian/generated'),
    });

    const buildOne = vi.fn((filePath: string, currentConfig) => buildFile(filePath, currentConfig));
    const controller = createWatchController(
      config,
      createTestDeps({
        buildFile: buildOne,
      }),
    );

    await controller.start();

    controller.handleFsEvent('change', '.meridian/generated/Counter.meridian.tsx');
    await vi.advanceTimersByTimeAsync(80);

    expect(buildOne).not.toHaveBeenCalled();

    controller.close();
  });

  it('ignores changes inside excluded directories', async () => {
    const cwd = makeTempProject();
    writeFileSync(join(cwd, 'src', 'Counter.meridian.tsx'), validCounterSource(), 'utf8');
    mkdirSync(join(cwd, 'src', 'node_modules'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'node_modules', 'Ignored.tsx'), 'export const ignored = true;\n', 'utf8');

    const config = resolveConfig({ cwd });
    const buildOne = vi.fn((filePath: string, currentConfig) => buildFile(filePath, currentConfig));
    const controller = createWatchController(
      config,
      createTestDeps({
        buildFile: buildOne,
      }),
    );

    await controller.start();

    controller.handleFsEvent('change', 'node_modules/Ignored.tsx');
    await vi.advanceTimersByTimeAsync(80);

    expect(buildOne).not.toHaveBeenCalled();

    controller.close();
  });

  it('removes generated output when a Meridian source file is deleted', async () => {
    const cwd = makeTempProject();
    const sourcePath = join(cwd, 'src', 'Counter.meridian.tsx');
    const outputPath = join(cwd, '.meridian/generated', 'Counter.meridian.tsx');
    writeFileSync(sourcePath, validCounterSource(), 'utf8');

    const config = resolveConfig({ cwd });
    const removeOne = vi.fn((filePath: string, currentConfig) => removeOutputForSource(filePath, currentConfig));
    const controller = createWatchController(
      config,
      createTestDeps({
        removeOutputForSource: removeOne,
      }),
    );

    await controller.start();
    expect(existsSync(outputPath)).toBe(true);

    rmSync(sourcePath);
    controller.handleFsEvent('rename', 'Counter.meridian.tsx');
    await vi.advanceTimersByTimeAsync(80);

    expect(removeOne).toHaveBeenCalledWith(sourcePath, config);
    expect(existsSync(outputPath)).toBe(false);

    controller.close();
  });

  it('reports invalid source diagnostics and recovers after the file is fixed', async () => {
    const cwd = makeTempProject();
    const sourcePath = join(cwd, 'src', 'Counter.meridian.tsx');
    const outputPath = join(cwd, '.meridian/generated', 'Counter.meridian.tsx');
    writeFileSync(sourcePath, validCounterSource(), 'utf8');

    const config = resolveConfig({ cwd });
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const controller = createWatchController(config, createTestDeps());

    await controller.start();
    expect(existsSync(outputPath)).toBe(true);

    writeFileSync(
      sourcePath,
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

    controller.handleFsEvent('change', 'Counter.meridian.tsx');
    await vi.advanceTimersByTimeAsync(80);

    expect(existsSync(outputPath)).toBe(false);
    expect(stderr).toHaveBeenCalled();
    expect(stderr.mock.calls.some((call) => String(call[0]).includes('error M001'))).toBe(true);

    writeFileSync(sourcePath, validCounterSource('Recovered'), 'utf8');
    controller.handleFsEvent('change', 'Counter.meridian.tsx');
    await vi.advanceTimersByTimeAsync(80);

    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, 'utf8')).toContain('Recovered: {count}');

    controller.close();
  });
});
