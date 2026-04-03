import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, relative, dirname, extname, basename } from 'node:path';
import { compileModule } from '@meridian/compiler';
import type { MeridianConfig } from './config.js';

export interface BuildResult {
  compiled: number;
  copied: number;
  errors: number;
  warnings: number;
}

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function isMeridianSource(source: string): boolean {
  return (
    source.includes("'@meridian/meridian'") ||
    source.includes('"@meridian/meridian"')
  );
}

export async function build(config: MeridianConfig): Promise<BuildResult> {
  const result: BuildResult = { compiled: 0, copied: 0, errors: 0, warnings: 0 };

  const files = collectFiles(config.inputDir);

  for (const filePath of files) {
    const ext = extname(filePath);
    const rel = relative(config.inputDir, filePath);

    const isMeridianExt =
      (ext === '.ts' || ext === '.tsx') &&
      config.extensions.includes(ext.slice(1) as 'ts' | 'tsx');

    if (isMeridianExt) {
      const source = readFileSync(filePath, 'utf-8');

      if (isMeridianSource(source)) {
        const compileResult = compileModule(source, filePath);

        const fileErrors = compileResult.diagnostics.filter((d) => d.severity === 'error');
        const fileWarnings = compileResult.diagnostics.filter((d) => d.severity === 'warning');

        result.warnings += fileWarnings.length;

        if (fileErrors.length > 0) {
          result.errors += fileErrors.length;
          for (const diag of fileErrors) {
            process.stderr.write(
              `${diag.file}:${diag.line}:${diag.column}: error ${diag.code}: ${diag.message}\n`,
            );
          }
        } else if (compileResult.output !== undefined) {
          const outRelBase = basename(rel, ext);
          const outRel = join(dirname(rel), `${outRelBase}.tsx`);
          const outPath = join(config.outDir, outRel);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, compileResult.output, 'utf-8');
          result.compiled += 1;
        }

        continue;
      }
    }

    // Copy all other files through unchanged
    const outPath = join(config.outDir, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(filePath, outPath);
    result.copied += 1;
  }

  console.log(
    `Meridian: compiled ${result.compiled}, copied ${result.copied}, errors ${result.errors}, warnings ${result.warnings}`,
  );

  return result;
}
