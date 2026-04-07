import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { compileModule } from '../compile.js';

export interface RuntimeSourceModule {
  filePath: string;
  source: string;
}

export interface LoadedRuntimeModule<TModule = Record<string, unknown>> {
  module: TModule;
  outputByFile: Map<string, string>;
  cleanup: () => Promise<void>;
}

const RUNTIME_DIR = path.resolve(process.cwd(), '.meridian-runtime-tests');

function formatDiagnostics(sourceFile: string, diagnostics: ReturnType<typeof compileModule>['diagnostics']): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `${diagnostic.code} ${diagnostic.message} (${diagnostic.file}:${diagnostic.line}:${diagnostic.column})`,
    )
    .join('\n');
}

function toRuntimeModulePath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.mjs`);
}

function rewriteRelativeSpecifier(specifier: string): string {
  if (!specifier.startsWith('.')) {
    return specifier;
  }

  if (/\.(?:[cm]?[jt]sx?|mjs|cjs|json|node)$/u.test(specifier)) {
    return specifier.replace(/\.(?:[cm]?[jt]sx?)$/u, '.mjs');
  }

  return `${specifier}.mjs`;
}

function rewriteRuntimeImports(source: string): string {
  return source
    .replace(/(from\s+['"])([^'"]+)(['"])/gu, (_match, prefix: string, specifier: string, suffix: string) => {
      return `${prefix}${rewriteRelativeSpecifier(specifier)}${suffix}`;
    })
    .replace(
      /(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/gu,
      (_match, prefix: string, specifier: string, suffix: string) => {
        return `${prefix}${rewriteRelativeSpecifier(specifier)}${suffix}`;
      },
    );
}

async function writeCompiledModule(
  runtimeDir: string,
  moduleDefinition: RuntimeSourceModule,
): Promise<{ runtimePath: string; output: string }> {
  const result = compileModule(moduleDefinition.source, moduleDefinition.filePath);
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') || !result.output) {
    throw new Error(
      `Failed to compile ${moduleDefinition.filePath} for runtime evaluation.\n${formatDiagnostics(
        moduleDefinition.filePath,
        result.diagnostics,
      )}`,
    );
  }

  const rewrittenOutput = rewriteRuntimeImports(result.output);
  const transpiled = ts.transpileModule(rewrittenOutput, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      verbatimModuleSyntax: true,
    },
    fileName: moduleDefinition.filePath,
  });

  const runtimePath = path.join(runtimeDir, toRuntimeModulePath(moduleDefinition.filePath));
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, transpiled.outputText, 'utf8');

  return {
    runtimePath,
    output: result.output,
  };
}

export async function compileAndLoadModules<TModule = Record<string, unknown>>(
  modules: RuntimeSourceModule[],
  entryFilePath: string,
): Promise<LoadedRuntimeModule<TModule>> {
  await mkdir(RUNTIME_DIR, { recursive: true });
  const runtimeDir = await mkdtemp(path.join(RUNTIME_DIR, 'run-'));
  const outputByFile = new Map<string, string>();

  try {
    for (const moduleDefinition of modules) {
      const compiled = await writeCompiledModule(runtimeDir, moduleDefinition);
      outputByFile.set(moduleDefinition.filePath, compiled.output);
    }

    const entryRuntimePath = path.join(runtimeDir, toRuntimeModulePath(entryFilePath));
    const module = (await import(pathToFileURL(entryRuntimePath).href)) as TModule;

    return {
      module,
      outputByFile,
      cleanup: async () => {
        await rm(runtimeDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(runtimeDir, { recursive: true, force: true });
    throw error;
  }
}
