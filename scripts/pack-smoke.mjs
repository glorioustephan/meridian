import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rootPackageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const tempDir = mkdtempSync(join(tmpdir(), 'meridian-pack-smoke-'));
const tarballDir = join(tempDir, 'tarballs');
const consumerDir = join(tempDir, 'consumer');

const packages = [
  { name: 'meridian', dir: 'packages/meridian' },
  { name: '@meridian/compiler', dir: 'packages/compiler' },
  { name: '@meridian/cli', dir: 'packages/cli' },
];
const tarballMap = new Map();

try {
  mkdirSync(tarballDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  const tarballs = packages.map((pkg) => packPackage(pkg));
  tarballs.forEach(validateTarballContents);

  writeConsumerProject();
  installTarballs(tarballs);
  validateInstalledPackages();
  runCliSmokeBuild();

  console.log('pack smoke test passed');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function packPackage(pkg) {
  const packageDir = join(rootDir, pkg.dir);
  const output = execFileSync('pnpm', ['--dir', packageDir, 'pack', '--pack-destination', tarballDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  const tarballPath = output
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.tgz'))
    .at(-1);

  if (!tarballPath) {
    throw new Error(`Failed to determine tarball path for ${pkg.name}.\n${output}`);
  }

  tarballMap.set(pkg.name, tarballPath);
  return { ...pkg, tarballPath };
}

function validateTarballContents(pkg) {
  const contents = execFileSync('tar', ['-tf', pkg.tarballPath], {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);

  if (!contents.includes('package/package.json')) {
    throw new Error(`${pkg.name} tarball is missing package.json.`);
  }

  if (!contents.includes('package/README.md')) {
    throw new Error(`${pkg.name} tarball is missing README.md.`);
  }

  const forbiddenPatterns = [
    /(^|\/)src\//,
    /\.test\.(?:js|d\.ts|js\.map|d\.ts\.map)$/,
    /tsconfig\.tsbuildinfo$/,
    /(^|\/)fixtures\//,
  ];

  for (const entry of contents) {
    if (forbiddenPatterns.some((pattern) => pattern.test(entry))) {
      throw new Error(`${pkg.name} tarball contains forbidden entry: ${entry}`);
    }
  }

  if (!contents.some((entry) => entry.startsWith('package/dist/'))) {
    throw new Error(`${pkg.name} tarball does not contain dist/ output.`);
  }
}

function writeConsumerProject() {
  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'meridian-pack-smoke-consumer',
        private: true,
        type: 'module',
        packageManager: rootPackageJson.packageManager,
        dependencies: {
          meridian: `file:${join(tarballDir, findTarball('meridian'))}`,
          '@meridian/compiler': `file:${join(tarballDir, findTarball('@meridian/compiler'))}`,
          '@meridian/cli': `file:${join(tarballDir, findTarball('@meridian/cli'))}`,
        },
        pnpm: {
          overrides: {
            '@meridian/compiler': `file:${join(tarballDir, findTarball('@meridian/compiler'))}`,
          },
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
        },
      },
      null,
      2,
    ),
  );

  mkdirSync(join(consumerDir, 'src', 'components'), { recursive: true });
  writeFileSync(
    join(consumerDir, 'src', 'components', 'Child.meridian.tsx'),
    `'use client';\nimport { Component } from 'meridian';\n\nexport default class Child extends Component<{ label: string }> {\n  render() {\n    return <span>{this.props.label}</span>;\n  }\n}\n`,
  );
  writeFileSync(
    join(consumerDir, 'src', 'components', 'Parent.meridian.tsx'),
    `'use client';\nimport { Component, state } from 'meridian';\nimport Child from './Child.meridian';\n\nexport default class Parent extends Component<{ initial: string }> {\n  @state label = this.props.initial;\n\n  update(next: string): void {\n    this.label = next;\n  }\n\n  render() {\n    return (\n      <section>\n        <Child label={this.label} />\n        <button onClick={() => this.update('updated')}>Update</button>\n      </section>\n    );\n  }\n}\n`,
  );
}

function installTarballs(tarballs) {
  void tarballs;
  execFileSync('pnpm', ['install'], {
    cwd: consumerDir,
    stdio: 'inherit',
  });
}

function validateInstalledPackages() {
  execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `const meridian = await import('meridian');
const compiler = await import('@meridian/compiler');
if (typeof meridian.Component !== 'function') throw new Error('Missing Component export');
if (typeof compiler.compileModule !== 'function') throw new Error('Missing compileModule export');`,
    ],
    {
      cwd: consumerDir,
      stdio: 'inherit',
    },
  );

  execFileSync('pnpm', ['exec', 'meridian', '--help'], {
    cwd: consumerDir,
    stdio: 'inherit',
  });
}

function runCliSmokeBuild() {
  execFileSync('pnpm', ['exec', 'meridian', 'build'], {
    cwd: consumerDir,
    stdio: 'inherit',
  });

  const generatedChild = join(
    consumerDir,
    '.meridian',
    'generated',
    'components',
    'Child.meridian.tsx',
  );
  const generatedParent = join(
    consumerDir,
    '.meridian',
    'generated',
    'components',
    'Parent.meridian.tsx',
  );

  if (!existsSync(generatedChild) || !existsSync(generatedParent)) {
    throw new Error('CLI smoke build did not generate the expected files.');
  }

  const parentSource = readFileSync(generatedParent, 'utf8');
  if (!parentSource.includes(`import Child from './Child.meridian';`)) {
    throw new Error('Generated parent component did not preserve the generated child import.');
  }

  const installedPackageJson = JSON.parse(
    readFileSync(join(consumerDir, 'node_modules', 'meridian', 'package.json'), 'utf8'),
  );

  if (installedPackageJson.name !== 'meridian') {
    throw new Error(`Unexpected installed package name: ${installedPackageJson.name}`);
  }
}

function findTarball(packageName) {
  const tarballPath = tarballMap.get(packageName);
  if (!tarballPath) {
    throw new Error(`Missing tarball mapping for ${packageName}.`);
  }

  const tarballName = basename(tarballPath);
  return tarballName;
}
