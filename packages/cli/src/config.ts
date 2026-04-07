import { join, resolve } from 'node:path';

export interface MeridianConfig {
  cwd: string;
  inputDir: string;
  outDir: string;
  extensions: Array<'ts' | 'tsx'>;
  sourceMaps: boolean;
  copyFiles: boolean;
  excludeDirs: string[];
}

export function resolveConfig(partial: Partial<MeridianConfig>): MeridianConfig {
  const cwd = partial.cwd ?? process.cwd();
  const inputDir = partial.inputDir ?? join(cwd, 'src');
  const outDir = partial.outDir ?? join(cwd, '.meridian/generated');

  return {
    cwd,
    inputDir: resolve(inputDir),
    outDir: resolve(outDir),
    extensions: partial.extensions ?? ['ts', 'tsx'],
    sourceMaps: partial.sourceMaps ?? false,
    copyFiles: partial.copyFiles ?? false,
    excludeDirs: partial.excludeDirs ?? [
      '.git',
      '.hg',
      '.svn',
      '.turbo',
      '.next',
      '.cache',
      '.meridian',
      'node_modules',
      'dist',
      'coverage',
    ],
  };
}
