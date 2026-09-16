/**
 * Build the client bundle: src/client/index.ts -> lib/client.js.
 *
 * React and the host client runtime stay external (provided through the host
 * module loader); the plugin stylesheet is inlined into a module that injects a
 * <style> tag once, so the installed package needs no separate asset serving.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '../..');
const outFile = join(root, 'lib', 'client.js');

/** Inline every imported stylesheet into a JS module that injects it once. */
const inlineCssPlugin = {
  name: 'omnimux-apps-inline-css',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, (args) => {
      const css = readFileSync(args.path, 'utf8');
      const id = `omnimux-apps-css:${args.path.split('/').slice(-2).join('/')}`;
      const contents = `
const styleId = ${JSON.stringify(id)};
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
}
export default ${JSON.stringify(css)};
`;
      return { contents, loader: 'js' };
    });
  },
};

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
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
  plugins: [inlineCssPlugin],
  alias: kitDir ? { 'dsh-ui-kit': kitDir } : {},
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
});

const code = result.outputFiles[0]?.text;
if (!code) throw new Error('esbuild produced no output');

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux-apps",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, wrapped);
console.log(`wrote lib/client.js (${wrapped.length} bytes)`);
