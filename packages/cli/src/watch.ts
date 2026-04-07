import { existsSync, statSync, watch as fsWatch, type FSWatcher } from 'node:fs';
import { extname, resolve } from 'node:path';
import {
  build,
  buildFile,
  combineBuildResults,
  emptyBuildResult,
  isExcludedPath,
  logBuildResult,
  removeOutputForSource,
  shouldCompile,
  shouldCopy,
  type BuildResult,
} from './build.js';
import type { MeridianConfig } from './config.js';

type WatchAction = 'rebuild' | 'delete';
type TimerHandle = ReturnType<typeof setTimeout>;

export interface WatchClassification {
  kind: 'ignored' | 'full-rebuild' | WatchAction;
  filePath?: string;
}

export interface WatchControllerDeps {
  buildAll: (config: MeridianConfig) => Promise<BuildResult>;
  buildFile: (filePath: string, config: MeridianConfig) => BuildResult;
  removeOutputForSource: (filePath: string, config: MeridianConfig) => number;
  logBuildResult: (result: BuildResult) => void;
  log: (message: string) => void;
  watch: (
    path: string,
    listener: (eventType: string, filename: string | Buffer | null) => void,
  ) => FSWatcherLike;
  setTimeout: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

export interface FSWatcherLike {
  close(): void;
}

export interface WatchController {
  start(): Promise<void>;
  close(): void;
  handleFsEvent(eventType: string, filename: string | Buffer | null): void;
  flush(): Promise<void>;
}

const defaultDeps: WatchControllerDeps = {
  buildAll: build,
  buildFile,
  removeOutputForSource,
  logBuildResult,
  log: console.log,
  watch: (pathName, listener) =>
    fsWatch(pathName, { recursive: true }, (eventType, filename) => {
      listener(eventType, filename);
    }),
  setTimeout: (callback, delayMs) => setTimeout(() => void callback(), delayMs),
  clearTimeout: clearTimeout as WatchControllerDeps['clearTimeout'],
};

function isRelevantPath(filePath: string, config: MeridianConfig): boolean {
  if (isExcludedPath(filePath, config)) {
    return false;
  }

  const extension = extname(filePath).slice(1);
  return (
    config.extensions.includes(extension as 'ts' | 'tsx') ||
    (config.copyFiles && !config.extensions.includes(extension as 'ts' | 'tsx'))
  );
}

export function classifyChange(
  filePath: string,
  config: MeridianConfig,
): WatchClassification {
  const resolvedPath = resolve(filePath);

  if (!isRelevantPath(resolvedPath, config)) {
    return { kind: 'ignored' };
  }

  if (!existsSync(resolvedPath)) {
    return { kind: 'delete', filePath: resolvedPath };
  }

  const stat = statSync(resolvedPath);
  if (stat.isDirectory()) {
    return { kind: 'full-rebuild' };
  }

  if (shouldCompile(resolvedPath, config) || shouldCopy(resolvedPath, config)) {
    return { kind: 'rebuild', filePath: resolvedPath };
  }

  return { kind: 'ignored' };
}

export async function runIncrementalBuild(
  changes: Map<string, WatchAction>,
  config: MeridianConfig,
  deps: Pick<
    WatchControllerDeps,
    'buildFile' | 'removeOutputForSource' | 'logBuildResult'
  >,
): Promise<BuildResult> {
  const results: BuildResult[] = [];

  for (const [filePath, action] of changes.entries()) {
    if (action === 'delete') {
      const removed = deps.removeOutputForSource(filePath, config);
      results.push({
        compiled: 0,
        copied: 0,
        removed,
        errors: 0,
        warnings: 0,
      });
      continue;
    }

    results.push(deps.buildFile(filePath, config));
  }

  const result = combineBuildResults(results);
  if (
    result.compiled > 0 ||
    result.copied > 0 ||
    result.removed > 0 ||
    result.errors > 0 ||
    result.warnings > 0
  ) {
    deps.logBuildResult(result);
  }

  return result;
}

export function createWatchController(
  config: MeridianConfig,
  deps: WatchControllerDeps = defaultDeps,
): WatchController {
  let timer: TimerHandle | undefined;
  let watcher: FSWatcherLike | undefined;
  let running = false;
  let rerunRequested = false;
  let needsFullRebuild = false;
  const pendingChanges = new Map<string, WatchAction>();

  const executePending = async (): Promise<void> => {
    if (running) {
      rerunRequested = true;
      return;
    }

    running = true;

    do {
      rerunRequested = false;
      const fullRebuild = needsFullRebuild;
      const changes = new Map(pendingChanges);

      needsFullRebuild = false;
      pendingChanges.clear();

      if (fullRebuild) {
        await deps.buildAll(config);
        continue;
      }

      if (changes.size > 0) {
        await runIncrementalBuild(changes, config, deps);
      }
    } while (rerunRequested || needsFullRebuild || pendingChanges.size > 0);

    running = false;
  };

  const scheduleExecution = (): void => {
    if (timer) {
      deps.clearTimeout(timer);
    }

    timer = deps.setTimeout(() => {
      timer = undefined;
      return executePending();
    }, 75);
  };

  return {
    async start(): Promise<void> {
      await deps.buildAll(config);
      deps.log(`Watching ${config.inputDir} for Meridian source changes...`);
      watcher = deps.watch(config.inputDir, (eventType, filename) => {
        this.handleFsEvent(eventType, filename);
      });
    },

    close(): void {
      if (timer) {
        deps.clearTimeout(timer);
        timer = undefined;
      }
      watcher?.close();
      watcher = undefined;
    },

    handleFsEvent(_eventType: string, filename: string | Buffer | null): void {
      if (!filename) {
        needsFullRebuild = true;
        scheduleExecution();
        return;
      }

      const fullPath = resolve(config.inputDir, filename.toString());
      const classification = classifyChange(fullPath, config);

      if (classification.kind === 'ignored') {
        return;
      }

      if (classification.kind === 'full-rebuild') {
        needsFullRebuild = true;
        scheduleExecution();
        return;
      }

      if (classification.filePath) {
        pendingChanges.set(classification.filePath, classification.kind);
        scheduleExecution();
      }
    },

    async flush(): Promise<void> {
      if (timer) {
        deps.clearTimeout(timer);
        timer = undefined;
      }
      await executePending();
    },
  };
}

export async function watch(config: MeridianConfig): Promise<void> {
  const controller = createWatchController(config);
  await controller.start();
}
