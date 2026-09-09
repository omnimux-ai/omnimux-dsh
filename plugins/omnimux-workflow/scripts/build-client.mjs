/**
 * Build the chrome bundle: src/client/index.js -> lib/client.js.
 *
 * React stays external (host React 18 via ModuleLoader), matching the
 * omnimux-assets plugin convention. The chrome never mounts the
 * canvas island itself — CanvasBridge only passes a DOM container and
 * plain-data props to window.__omnimuxWorkflowCanvas.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '../..');
const outFile = join(root, 'lib', 'client.js');

let cur = root;
let kitDir = null;
while (cur && cur !== dirname(cur)) {
  const candidate = join(cur, 'personal', 'dsh-ui-kit');
  if (existsSync(candidate)) {
    kitDir = candidate;
    break;
  }
  cur = dirname(cur);
}

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
  alias: {
    'dsh-ui-kit': kitDir,
  },
  nodePaths: [
    join(root, 'node_modules'),
    join(repoRoot, 'node_modules/.pnpm/node_modules'),
    join(repoRoot, 'node_modules'),
  ],
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
})

const code = result.outputFiles[0]?.text
if (!code) throw new Error('esbuild produced no output')

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux-workflow",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, wrapped)
console.log(`wrote ${outFile} (${wrapped.length} bytes)`)
