import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { compileModule } from '@meridian/compiler';
import type { MeridianConfig } from './config.js';

export interface BuildResult {
  compiled: number;
  copied: number;
  removed: number;
  errors: number;
  warnings: number;
}

export function emptyBuildResult(): BuildResult {
  return {
    compiled: 0,
    copied: 0,
    removed: 0,
    errors: 0,
    warnings: 0,
  };
}

export function combineBuildResults(results: BuildResult[]): BuildResult {
  return results.reduce<BuildResult>((combined, current) => {
    combined.compiled += current.compiled;
    combined.copied += current.copied;
    combined.removed += current.removed;
    combined.errors += current.errors;
    combined.warnings += current.warnings;
    return combined;
  }, emptyBuildResult());
}

export function logBuildResult(result: BuildResult): void {
  console.log(
    `Meridian: compiled ${result.compiled}, copied ${result.copied}, removed ${result.removed}, errors ${result.errors}, warnings ${result.warnings}`,
  );
}

export function isExcludedPath(pathName: string, config: MeridianConfig): boolean {
  const resolvedPath = resolve(pathName);
  const segments = resolvedPath.split(sep).filter(Boolean);
  if (segments.some((segment) => config.excludeDirs.includes(segment))) {
    return true;
  }

  return resolvedPath === config.outDir || resolvedPath.startsWith(`${config.outDir}/`);
}

export function collectFiles(dir: string, config: MeridianConfig): string[] {
  if (!existsSync(dir) || isExcludedPath(dir, config)) {
    return [];
  }

  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!isExcludedPath(fullPath, config)) {
        files.push(...collectFiles(fullPath, config));
      }
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

export function isMeridianSource(source: string): boolean {
  return /\bfrom\s+['"]meridian['"]/.test(source);
}

export function shouldCompile(filePath: string, config: MeridianConfig): boolean {
  const extension = extname(filePath).slice(1);
  return config.extensions.includes(extension as 'ts' | 'tsx');
}

export function shouldCopy(filePath: string, config: MeridianConfig): boolean {
  if (!config.copyFiles) {
    return false;
  }

  const extension = extname(filePath).slice(1);
  return !config.extensions.includes(extension as 'ts' | 'tsx');
}

function outputPathForCompile(filePath: string, config: MeridianConfig): string {
  const rel = relative(config.inputDir, filePath);
  const extension = extname(filePath);
  return join(config.outDir, dirname(rel), `${basename(rel, extension)}.tsx`);
}

export function getOutputPath(filePath: string, config: MeridianConfig): string | undefined {
  if (shouldCompile(filePath, config)) {
    return outputPathForCompile(filePath, config);
  }

  if (shouldCopy(filePath, config)) {
    const rel = relative(config.inputDir, filePath);
    return join(config.outDir, rel);
  }

  return undefined;
}

function pruneEmptyDirectories(startDir: string, stopDir: string): void {
  let currentDir = startDir;

  while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
    if (!existsSync(currentDir)) {
      currentDir = dirname(currentDir);
      continue;
    }

    const entries = readdirSync(currentDir);
    if (entries.length > 0) {
      return;
    }

    rmSync(currentDir, { recursive: false, force: true });
    currentDir = dirname(currentDir);
  }
}

function writeDiagnostics(diagnostics: ReturnType<typeof compileModule>['diagnostics']): void {
  for (const diagnostic of diagnostics.filter((current) => current.severity === 'error')) {
    process.stderr.write(
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: error ${diagnostic.code}: ${diagnostic.message}\n`,
    );
  }
}

export function removeOutputForSource(filePath: string, config: MeridianConfig): number {
  const outPath = getOutputPath(filePath, config);
  if (!outPath || !existsSync(outPath)) {
    return 0;
  }

  rmSync(outPath, { recursive: false, force: true });
  pruneEmptyDirectories(dirname(outPath), config.outDir);
  return 1;
}

export function buildFile(filePath: string, config: MeridianConfig): BuildResult {
  const result = emptyBuildResult();

  if (shouldCompile(filePath, config)) {
    const source = readFileSync(filePath, 'utf-8');

    if (!isMeridianSource(source)) {
      result.removed += removeOutputForSource(filePath, config);
      return result;
    }

    const compileResult = compileModule(source, filePath);
    const fileErrors = compileResult.diagnostics.filter((diag) => diag.severity === 'error');
    const fileWarnings = compileResult.diagnostics.filter((diag) => diag.severity === 'warning');

    result.warnings += fileWarnings.length;

    if (fileErrors.length > 0 || compileResult.output === undefined) {
      result.errors += fileErrors.length || 1;
      result.removed += removeOutputForSource(filePath, config);
      writeDiagnostics(compileResult.diagnostics);
      return result;
    }

    const outPath = outputPathForCompile(filePath, config);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, compileResult.output, 'utf-8');
    result.compiled += 1;
    return result;
  }

  if (shouldCopy(filePath, config)) {
    const outPath = getOutputPath(filePath, config);
    if (!outPath) {
      return result;
    }

    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(filePath, outPath);
    result.copied += 1;
  }

  return result;
}

export async function build(config: MeridianConfig): Promise<BuildResult> {
  const files = collectFiles(config.inputDir, config);
  const result = combineBuildResults(files.map((filePath) => buildFile(filePath, config)));

  logBuildResult(result);
  return result;
}
