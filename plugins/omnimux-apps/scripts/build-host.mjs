/**
 * Build the host bundles: TypeScript sources -> dist/*.js.
 *
 * The installed runtime loads this package from node_modules, where Node refuses to
 * strip types; every entry therefore ships as plain ESM JavaScript. Node builtins and
 * host-provided runtime packages stay external, everything else is bundled so the
 * copy-directory install has no unresolved third-party requires.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '../..');

/** Package entry points that must exist as compiled JavaScript, mirroring `exports`. */
const ENTRIES = [
  { entry: 'src/host/index.ts', out: 'dist/index.js' },
  // Types-only module: esbuild emits nothing, so a valid empty module is written instead
  // to keep the `./shared` subpath resolvable at runtime (it never had runtime code).
  { entry: 'src/shared/manifest.ts', out: 'dist/shared/manifest.js', allowEmpty: true },
  { entry: 'src/shared/schemaValidator.ts', out: 'dist/shared/schemaValidator.js' },
  { entry: 'src/host/storage/appStorage.ts', out: 'dist/host/storage/appStorage.js' },
];

for (const { entry, out, allowEmpty } of ENTRIES) {
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    write: false,
    logLevel: 'info',
    legalComments: 'none',
    nodePaths: [
      join(root, 'node_modules'),
      join(repoRoot, 'node_modules/.pnpm/node_modules'),
      join(repoRoot, 'node_modules'),
    ],
    external: ['node:*', '@deepseek-ai/*'],
  });

  const code = result.outputFiles[0]?.text;
  if (!code && !allowEmpty) throw new Error(`esbuild produced no output for ${entry}`);
  const contents = code || `// Types-only entry: no runtime exports.\nexport {};\n`;
  const outFile = join(root, out);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, contents);
  console.log(`wrote ${out} (${contents.length} bytes)`);
}
