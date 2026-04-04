#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveConfig } from './config.js';
import { build } from './build.js';
import { watch } from './watch.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    cwd: { type: 'string' },
    'input-dir': { type: 'string' },
    'out-dir': { type: 'string' },
    watch: { type: 'boolean', short: 'w' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

const command = positionals[0];

if (values.help || command === 'help') {
  console.log(`
meridian — Meridian compiler CLI

USAGE
  meridian build   Compile Meridian source files to React TSX
  meridian watch   Watch and recompile on changes

OPTIONS
  --cwd <dir>         Working directory (default: cwd)
  --input-dir <dir>   Input directory (default: cwd)
  --out-dir <dir>     Output directory (default: .meridian/generated)
  -w, --watch         Watch mode
  -h, --help          Show this help
`);
  process.exit(0);
}

const config = resolveConfig({
  ...(values['cwd'] ? { cwd: values['cwd'] } : {}),
  ...(values['input-dir'] ? { inputDir: values['input-dir'] } : {}),
  ...(values['out-dir'] ? { outDir: values['out-dir'] } : {}),
});

if (command === 'build' || (!command && !values['watch'])) {
  const result = await build(config);
  if (result.errors > 0) {
    process.exit(1);
  }
} else if (command === 'watch' || values['watch']) {
  await watch(config);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
