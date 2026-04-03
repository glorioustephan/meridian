export interface MeridianConfig {
  cwd: string;
  inputDir: string;
  outDir: string;
  extensions: Array<'ts' | 'tsx'>;
  sourceMaps: boolean;
}

export function resolveConfig(partial: Partial<MeridianConfig>): MeridianConfig {
  const cwd = partial.cwd ?? process.cwd();
  return {
    cwd,
    inputDir: partial.inputDir ?? cwd,
    outDir: partial.outDir ?? '.meridian/generated',
    extensions: partial.extensions ?? ['ts', 'tsx'],
    sourceMaps: partial.sourceMaps ?? true,
  };
}
