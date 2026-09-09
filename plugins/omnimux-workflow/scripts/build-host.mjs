/**
 * Build the host bundle: src/index.ts (TS) -> dist/index.js (single file).
 *
 * platform node, format esm, everything bundled (zod included) so the
 * installed runtime has zero third-party requires — copy-directory install.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '../..');
const outFile = join(root, 'dist', 'index.js');

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  nodePaths: [
    join(root, 'node_modules'),
    join(repoRoot, 'node_modules/.pnpm/node_modules'),
    join(repoRoot, 'node_modules'),
  ],
  write: false,
  logLevel: 'info',
  legalComments: 'none',
});

const code = result.outputFiles[0]?.text;
if (!code) throw new Error('esbuild produced no output');

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, code);
console.log(`wrote ${outFile} (${code.length} bytes)`);
