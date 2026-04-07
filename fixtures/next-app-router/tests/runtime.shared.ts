import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';
import { expect } from 'vitest';

const fixtureDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const pageFile = join(fixtureDir, 'app', 'page.tsx');
const runtimeTimeoutMs = 90_000;

type Cleanup = () => Promise<void> | void;

export interface RuntimeValidationOptions {
  buttonAfterClick?: string;
  devScript: 'dev:web' | 'dev:web:compiler';
  expectedButtonText: string;
  expectedHeading: string;
}

function getFixtureImportPath(): string {
  return readFileSync(pageFile, 'utf8');
}

async function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate a TCP port for fixture runtime validation.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });

    server.on('error', reject);
  });
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command "${command} ${args.join(' ')}" exited with code ${code ?? 'null'}.`));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }

      lastError = new Error(`Received status ${response.status} from ${url}.`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}.`);
}

async function killProcess(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null || process.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      process.kill('SIGKILL');
    }, 5_000);

    process.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    process.kill('SIGTERM');
  });
}

async function stopServer(process: ChildProcess): Promise<void> {
  await killProcess(process);
}

function startNextDev(port: number, devScript: RuntimeValidationOptions['devScript']): { process: ChildProcess } {
  const child = spawn(
    'pnpm',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: fixtureDir,
      env: {
        ...process.env,
        PORT: String(port),
        ...(devScript === 'dev:web:compiler'
          ? { MERIDIAN_REACT_COMPILER: '1' }
          : {}),
      },
      stdio: 'inherit',
    },
  );

  return { process: child };
}

export async function validateNextFixtureRuntime(options: RuntimeValidationOptions): Promise<void> {
  const cleanup: Cleanup[] = [];

  try {
    expect(getFixtureImportPath()).toContain("../.meridian/generated/components/Counter.meridian");

    await runCommand('pnpm', ['run', 'build:meridian'], fixtureDir);

    const port = await getPort();
    const url = `http://127.0.0.1:${port}`;
    const nextDev = startNextDev(port, options.devScript);
    cleanup.push(async () => stopServer(nextDev.process));

    const initialHtml = await waitForServer(url, 60_000);
    const normalizedInitialHtml = initialHtml.replace(/<!-- -->/g, '');
    expect(normalizedInitialHtml).toContain(options.expectedHeading);
    expect(normalizedInitialHtml).toContain(options.expectedButtonText);

    const browser = await chromium.launch();
    cleanup.push(async () => {
      await browser.close();
    });

    const page = await browser.newPage();
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      consoleMessages.push(message.text());
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: runtimeTimeoutMs });
    await page.getByRole('heading', { name: options.expectedHeading }).waitFor();

    const button = page.getByRole('button', { name: options.expectedButtonText });
    await button.waitFor();
    await button.click();
    await page
      .getByRole('button', { name: options.buttonAfterClick ?? 'Count: 3' })
      .waitFor();

    const hydrationProblems = [...consoleMessages, ...pageErrors].filter((message) =>
      /hydration|did not match|mismatch|server html|content does not match/i.test(message),
    );

    expect(hydrationProblems).toEqual([]);
  } finally {
    const pending = cleanup.reverse();
    for (const step of pending) {
      await step();
    }
  }
}

export async function validateReactCompilerBuild(): Promise<void> {
  await runCommand('pnpm', ['run', 'build:compiler'], fixtureDir, {
    ...process.env,
    MERIDIAN_REACT_COMPILER: '1',
  });

  const buildDirectory = join(fixtureDir, '.next');
  const files = await collectFiles(buildDirectory);
  const compiledChunks = files.filter((file) => /\.(?:js|mjs)$/.test(file));
  const chunkSources = compiledChunks.map((file) => ({
    file,
    source: readFileSync(file, 'utf8'),
  }));

  const meridianChunk = chunkSources.find(({ source }) =>
    source.includes('Meridian client child'),
  );
  expect(meridianChunk?.source).toBeDefined();
  expect(meridianChunk?.source).toContain('useState');
  expect(meridianChunk?.source).not.toContain('useMemo');
  expect(meridianChunk?.source).not.toContain('useCallback');
}

async function collectFiles(root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(root, entry.name);
      if (entry.isDirectory()) {
        return await collectFiles(fullPath);
      }

      return [fullPath];
    }),
  );

  return files.flat();
}
