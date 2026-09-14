import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('submitted canvas comments preserve frozen identity and ready notification', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const temp = await mkdtemp(join(root, '.query-test-'));
  try {
    const output = join(temp, 'hook.mjs');
    await build({ entryPoints: [fileURLToPath(new URL('../../../tests/submitted-canvas-text.test.ts', import.meta.url))],
      outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    await import(pathToFileURL(output).href);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
