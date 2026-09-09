import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packageRoot } from './docs.mjs';

const tests = readdirSync(join(packageRoot, 'test')).filter(name => name.endsWith('.test.mjs')).sort().map(name => join(packageRoot, 'test', name));
const checks = [
  [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '--noEmit', '--project', join(packageRoot, 'tsconfig.json')],
  ['--test', ...tests],
  [join(packageRoot, 'scripts/cli.mjs'), 'docs', '--check'],
];
for (const args of checks) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: packageRoot });
  if (result.error || result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exit(result.status || 1);
  }
}
