import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const clip = resolve(sourceDir, '../../..');
export const repo = resolve(clip, '../..');
const native = join(clip, 'src/client/openreel');
const require = createRequire(join(clip, 'package.json'));
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const config = (await import(pathToFileURL(join(clip, 'tailwind.openreel.config.js')).href)).default;
config.content = [join(clip, 'src/client/**/*.{js,jsx,ts,tsx}'), join(sourceDir, '*.tsx')];

function vendorFile(base, rest = '') {
  return (rest ? [rest + '.ts', rest + '.tsx', rest + '.js', rest + '/index.ts', rest + '/index.tsx', rest + '/index.js', rest] : ['index.ts', 'index.tsx', 'index.js']).map(p => join(base, p)).find(existsSync);
}
const aliasPlugin = {
  name: 'native-openreel-aliases',
  setup(build) {
    build.onResolve({ filter: /^@openreel\/(core|ui|agent|creation-schema)(\/.*)?$/ }, args => {
      const [, name, rest] = args.path.match(/^@openreel\/(core|ui|agent|creation-schema)(?:\/(.*))?$/);
      const path = vendorFile(join(native, name), rest);
      return path ? { path } : { errors: [{ text: `Cannot resolve ${args.path}` }] };
    });
    build.onResolve({ filter: /^@\// }, args => ({ path: vendorFile(join(native, 'web'), args.path.slice(2)) }));
  },
};
const cssPlugin = {
  name: 'native-openreel-css',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async args => {
      const result = await postcss([tailwindcss(config), autoprefixer()]).process(readFileSync(args.path, 'utf8'), { from: args.path });
      return { loader: 'js', contents: `const style = document.createElement('style'); style.textContent = ${JSON.stringify(result.css)}; document.head.appendChild(style);` };
    });
  },
};
const optionalPlugin = {
  name: 'optional-assets-and-telemetry-only',
  setup(build) {
    build.onResolve({ filter: /\.(wasm|wgsl)$|(?:whisper-worker|person-segmentation-worker)\.ts$/ }, args => ({ path: args.path, namespace: 'qa-optional-asset' }));
    build.onLoad({ filter: /.*/, namespace: 'qa-optional-asset' }, () => ({ contents: 'export default ""', loader: 'js' }));
    build.onResolve({ filter: /^posthog-js/ }, args => ({ path: args.path, namespace: 'qa-telemetry' }));
    build.onLoad({ filter: /.*/, namespace: 'qa-telemetry' }, () => ({ contents: 'export default { init(){}, capture(){}, identify(){} }; export const usePostHog = () => ({ capture(){} });', loader: 'js' }));
    build.onResolve({ filter: /^@astryxdesign\// }, args => ({ path: args.path, namespace: 'qa-unused-theme' }));
    build.onLoad({ filter: /.*/, namespace: 'qa-unused-theme' }, () => ({ contents: 'export default {}; export const Theme = ({children}) => children; export const neutralTheme = {};', loader: 'js' }));
  },
};
const shared = {
  absWorkingDir: sourceDir, bundle: true, target: 'es2022', jsx: 'automatic', legalComments: 'none', logLevel: 'info',
  nodePaths: [join(clip, 'node_modules'), join(repo, 'node_modules')],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.gif': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  define: { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production', BASE_URL: '/', SSR: false, VITE_PUBLIC_POSTHOG_KEY: '', VITE_PUBLIC_POSTHOG_HOST: '', VITE_CLOUD_API_URL: '', VITE_OPENREEL_TTS_URL: '', VITE_ENABLE_SW: '', VITE_OPENREEL_AUTH_BROKER_BASE_URL: '', VITE_OPENREEL_GPU_BASE_URL: '' }), 'process.env.NODE_ENV': '"production"' },
  external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core', '@ffmpeg/core-mt', '@huggingface/transformers', '@mediapipe/tasks-vision', 'node:fs', 'node:path', 'node:url'],
};

export async function buildFixture(qaDir) {
  mkdirSync(join(qaDir, 'dist'), { recursive: true });
  mkdirSync(join(qaDir, 'samples'), { recursive: true });
  await esbuild.build({ ...shared, platform: 'node', format: 'esm', banner: { js: 'globalThis.self ??= {};' }, entryPoints: [join(sourceDir, 'generate-samples.ts')], outfile: join(qaDir, 'dist/generate-samples.mjs'), plugins: [aliasPlugin, optionalPlugin] });
  await import(pathToFileURL(join(qaDir, 'dist/generate-samples.mjs')).href + `?build=${Date.now()}`);
  const result = await esbuild.build({ ...shared, platform: 'browser', format: 'iife', entryPoints: [join(sourceDir, 'fixture.tsx')], outfile: join(qaDir, 'dist/fixture.js'), metafile: true, plugins: [aliasPlugin, cssPlugin, optionalPlugin] });
  writeFileSync(join(qaDir, 'dist/metafile.json'), JSON.stringify(result.metafile, null, 2));
  writeFileSync(join(qaDir, 'dist/index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Clip security verification</title><body class="openreel-studio-root" data-theme="light"><div id="root"></div><script src="/fixture.js"></script></body></html>');
}
