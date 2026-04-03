import { watch as fsWatch } from 'node:fs';
import { resolve } from 'node:path';
import type { MeridianConfig } from './config.js';
import { build } from './build.js';

export async function watch(config: MeridianConfig): Promise<void> {
  // Initial build
  await build(config);

  console.log(`Watching ${config.inputDir} for changes...`);

  // Use node:fs watch (recursive on supported platforms)
  fsWatch(config.inputDir, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;
    const ext = filename.split('.').pop();
    if (ext === 'ts' || ext === 'tsx') {
      console.log(`Changed: ${filename} — rebuilding...`);
      await build(config);
    }
  });
}
