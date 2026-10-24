import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'lib', 'client.js')
const openreel = join(root, 'src/client/openreel')
const tailwindConfig = (await import(join(root, 'tailwind.openreel.config.js'))).default
tailwindConfig.content = [join(root, 'src/client/**/*.{js,jsx,ts,tsx}')]

const envStub = {
  DEV: false,
  MODE: 'production',
  PROD: true,
  SSR: false,
  BASE_URL: '/',
  VITE_PUBLIC_POSTHOG_KEY: '',
  VITE_PUBLIC_POSTHOG_HOST: '',
  VITE_CLOUD_API_URL: '',
  VITE_OPENREEL_TTS_URL: '',
  VITE_ENABLE_SW: '',
  VITE_OPENREEL_AUTH_BROKER_BASE_URL: '',
  VITE_OPENREEL_GPU_BASE_URL: '',
}

function stubPlugin(filter, contents, loader = 'js') {
  return {
    name: `stub:${filter}`,
    setup(build) {
      build.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: `stub:${filter.source}`,
      }))
      build.onLoad({ filter: /.*/, namespace: `stub:${filter.source}` }, () => ({
        contents,
        loader,
      }))
    },
  }
}

const tailwindPlugin = {
  name: 'openreel-tailwind',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = readFileSync(args.path, 'utf8')
      const result = await postcss([
        tailwindcss(tailwindConfig),
        autoprefixer(),
      ]).process(css, { from: args.path })
      const injected = `(() => {
  if (typeof document === "undefined") return;
  const id = ${JSON.stringify('omnimux-clip-css:' + args.path.split('/').slice(-3).join('/'))};
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = ${JSON.stringify(result.css)};
  document.head.appendChild(style);
})();
export default ${JSON.stringify(result.css)};`
      return { contents: injected, loader: 'js' }
    })
  },
}

const emptyAssetPlugin = {
  name: 'empty-optional-assets',
  setup(build) {
    build.onResolve({ filter: /\.(wasm|wgsl)$/ }, (args) => ({
      path: args.path,
      namespace: 'empty-asset',
    }))
    build.onResolve({ filter: /(?:whisper-worker|person-segmentation-worker)\.ts$/ }, (args) => ({
      path: args.path,
      namespace: 'empty-worker',
    }))
    build.onLoad({ filter: /.*/, namespace: 'empty-asset' }, () => ({
      contents: 'export default ""',
      loader: 'js',
    }))
    build.onLoad({ filter: /.*/, namespace: 'empty-worker' }, () => ({
      contents: 'export default function WorkerStub() {}',
      loader: 'js',
    }))
  },
}

function resolveVendorFile(base, rest) {
  const candidates = rest
    ? [
        join(base, `${rest}.ts`),
        join(base, `${rest}.tsx`),
        join(base, `${rest}.js`),
        join(base, rest, 'index.ts'),
        join(base, rest, 'index.tsx'),
        join(base, rest, 'index.js'),
        join(base, rest),
      ]
    : [
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
        join(base, 'index.js'),
      ]
  return candidates.find((file) => existsSync(file))
}

const openreelAliasPlugin = {
  name: 'openreel-alias',
  setup(build) {
    const packages = {
      '@openreel/core': join(openreel, 'core'),
      '@openreel/ui': join(openreel, 'ui'),
      '@openreel/agent': join(openreel, 'agent'),
      '@openreel/creation-schema': join(openreel, 'creation-schema'),
    }
    build.onResolve({ filter: /^@openreel\/(core|ui|agent|creation-schema)(\/.*)?$/ }, (args) => {
      const match = args.path.match(/^(@openreel\/(?:core|ui|agent|creation-schema))(?:\/(.*))?$/)
      if (!match) return undefined
      const file = resolveVendorFile(packages[match[1]], match[2])
      if (!file) return { errors: [{ text: `cannot resolve ${args.path}` }] }
      return { path: file }
    })
    build.onResolve({ filter: /^@\// }, (args) => {
      const rest = args.path.slice(2)
      const file = resolveVendorFile(join(openreel, 'web'), rest)
      if (!file) return { errors: [{ text: `cannot resolve ${args.path}` }] }
      return { path: file }
    })
  },
}

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  write: false,
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'none',
  logLevel: 'info',
  sourcemap: false,
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.gif': 'dataurl',
    '.svg': 'dataurl',
    '.webp': 'dataurl',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
    '.css': 'js',
  },
  define: {
    'import.meta.env': JSON.stringify(envStub),
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {},
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@ffmpeg/ffmpeg',
    '@ffmpeg/util',
    '@ffmpeg/core',
    '@ffmpeg/core-mt',
    '@huggingface/transformers',
    '@astryxdesign/core',
    '@astryxdesign/core/reset.css',
    '@astryxdesign/core/astryx.css',
    '@astryxdesign/core/theme',
    '@astryxdesign/theme-neutral',
    '@astryxdesign/theme-neutral/theme.css',
    '@astryxdesign/theme-neutral/built',
    '@mediapipe/tasks-vision',
    'posthog-js',
    'posthog-js/react',
    'node:fs',
    'node:path',
    'node:url',
  ],
  plugins: [
    openreelAliasPlugin,
    tailwindPlugin,
    emptyAssetPlugin,
    stubPlugin(/^@astryxdesign\//, 'export default {}; export const Theme = ({ children }) => children; export const neutralTheme = {};'),
    stubPlugin(/^posthog-js/, 'export default { init() {}, capture() {}, identify() {} }; export const usePostHog = () => ({ capture() {} });'),
  ],
  nodePaths: [
    join(root, 'node_modules'),
    join(root, '../../node_modules'),
  ],
})

const code = result.outputFiles[0]?.text
if (!code) throw new Error('esbuild produced no output')

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux-clip",
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
