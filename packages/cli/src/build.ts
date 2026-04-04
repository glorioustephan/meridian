import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { compileModule } from '@meridian/compiler';
import type { MeridianConfig } from './config.js';

export interface BuildResult {
  compiled: number;
  copied: number;
  errors: number;
  warnings: number;
}

function isExcludedDir(pathName: string, config: MeridianConfig): boolean {
  const base = basename(pathName);
  if (config.excludeDirs.includes(base)) {
    return true;
  }

  const resolved = resolve(pathName);
  return resolved === config.outDir || resolved.startsWith(`${config.outDir}/`);
}

function collectFiles(dir: string, config: MeridianConfig): string[] {
  if (!existsSync(dir) || isExcludedDir(dir, config)) {
    return [];
  }

  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!isExcludedDir(fullPath, config)) {
        files.push(...collectFiles(fullPath, config));
      }
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function isMeridianSource(source: string): boolean {
  return /\bfrom\s+['"]meridian['"]/.test(source);
}

function shouldCompile(filePath: string, config: MeridianConfig): boolean {
  const extension = extname(filePath).slice(1);
  return config.extensions.includes(extension as 'ts' | 'tsx');
}

function shouldCopy(filePath: string, config: MeridianConfig): boolean {
  if (!config.copyFiles) {
    return false;
  }

  const extension = extname(filePath).slice(1);
  return !config.extensions.includes(extension as 'ts' | 'tsx');
}

export async function build(config: MeridianConfig): Promise<BuildResult> {
  const result: BuildResult = { compiled: 0, copied: 0, errors: 0, warnings: 0 };
  const files = collectFiles(config.inputDir, config);

  for (const filePath of files) {
    const rel = relative(config.inputDir, filePath);

    if (shouldCompile(filePath, config)) {
      const source = readFileSync(filePath, 'utf-8');
      if (!isMeridianSource(source)) {
        continue;
      }

      const compileResult = compileModule(source, filePath);
      const fileErrors = compileResult.diagnostics.filter((diag) => diag.severity === 'error');
      const fileWarnings = compileResult.diagnostics.filter((diag) => diag.severity === 'warning');

      result.warnings += fileWarnings.length;

      if (fileErrors.length > 0 || compileResult.output === undefined) {
        result.errors += fileErrors.length || 1;
        for (const diagnostic of fileErrors) {
          process.stderr.write(
            `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: error ${diagnostic.code}: ${diagnostic.message}\n`,
          );
        }
        continue;
      }

      const extension = extname(filePath);
      const outPath = join(config.outDir, dirname(rel), `${basename(rel, extension)}.tsx`);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, compileResult.output, 'utf-8');
      result.compiled += 1;
      continue;
    }

    if (shouldCopy(filePath, config)) {
      const outPath = join(config.outDir, rel);
      mkdirSync(dirname(outPath), { recursive: true });
      copyFileSync(filePath, outPath);
      result.copied += 1;
    }
  }

  console.log(
    `Meridian: compiled ${result.compiled}, copied ${result.copied}, errors ${result.errors}, warnings ${result.warnings}`,
  );

  return result;
}
