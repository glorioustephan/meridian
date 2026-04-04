import { watch as fsWatch } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type { MeridianConfig } from './config.js';
import { build } from './build.js';

function isIgnoredPath(pathName: string, config: MeridianConfig): boolean {
  const resolved = resolve(pathName);
  if (resolved.startsWith(`${config.outDir}/`) || resolved === config.outDir) {
    return true;
  }

  return config.excludeDirs.includes(basename(pathName));
}

export async function watch(config: MeridianConfig): Promise<void> {
  await build(config);
  console.log(`Watching ${config.inputDir} for Meridian source changes...`);

  let timer: NodeJS.Timeout | undefined;
  const scheduleBuild = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(async () => {
      await build(config);
    }, 75);
  };

  fsWatch(config.inputDir, { recursive: true }, async (_eventType, filename) => {
    if (!filename) {
      return;
    }

    const fullPath = resolve(config.inputDir, filename.toString());
    if (isIgnoredPath(fullPath, config)) {
      return;
    }

    const extension = extname(fullPath);
    if (!config.extensions.includes(extension.slice(1) as 'ts' | 'tsx')) {
      return;
    }

    await scheduleBuild();
  });
}
