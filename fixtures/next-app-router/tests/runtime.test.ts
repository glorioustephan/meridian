import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';

const fixtureDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const pageFile = join(fixtureDir, 'app', 'page.tsx');
const runtimeTimeoutMs = 90_000;

function getFixtureImportPath(): string {
  return readFileSync(pageFile, 'utf8');
}

function getPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a local port for the Next.js fixture.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
    server.on('error', reject);
  });
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Command failed: ${command} ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
      lastError = new Error(`Unexpected response status: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`Timed out waiting for ${url}.\nLast error: ${String(lastError)}`);
}

function killProcess(child: ChildProcess): void {
  if (child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }

  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      child.kill('SIGTERM');
      return;
    }
  }

  child.kill('SIGTERM');
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      killProcess(child);
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });

    killProcess(child);
  });
}

function startNextDev(port: number): {
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
} {
  const child = spawn('pnpm', ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
    },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout: string[] = [];
  const stderr: string[] = [];

  child.stdout?.on('data', (chunk) => {
    stdout.push(chunk.toString());
  });

  child.stderr?.on('data', (chunk) => {
    stderr.push(chunk.toString());
  });

  return { process: child, stdout, stderr };
}

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const dispose = cleanup.pop();
    if (dispose) {
      await dispose();
    }
  }
});

describe('Next.js App Router fixture runtime', () => {
  it(
    'boots under next dev, hydrates the Meridian child, and handles interaction',
    async () => {
      expect(getFixtureImportPath()).toContain("../.meridian/generated/components/Counter.meridian");

      await runCommand('pnpm', ['run', 'build:meridian'], fixtureDir);

      const port = await getPort();
      const url = `http://127.0.0.1:${port}`;
      const nextDev = startNextDev(port);
      cleanup.push(async () => stopServer(nextDev.process));

      const initialHtml = await waitForServer(url, 60_000);
      const normalizedInitialHtml = initialHtml.replace(/<!-- -->/g, '');
      expect(normalizedInitialHtml).toContain('Meridian Next.js Fixture');
      expect(normalizedInitialHtml).toContain('Count: 2');

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
      await page.getByRole('heading', { name: 'Meridian Next.js Fixture' }).waitFor();

      const button = page.getByRole('button', { name: 'Count: 2' });
      await button.waitFor();
      await button.click();
      await page.getByRole('button', { name: 'Count: 3' }).waitFor();

      const hydrationProblems = [...consoleMessages, ...pageErrors].filter((message) =>
        /hydration|did not match|mismatch|server html|content does not match/i.test(message),
      );

      expect(hydrationProblems).toEqual([]);
    },
    runtimeTimeoutMs,
  );
});
